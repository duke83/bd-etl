/// <reference path="../typings/node.d.ts" />
'use strict';
var QDateModule = require('./QDate');
var config = require("./config.js");
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
var getGlossaryItemByVarName = require('./getGlossaryItemByVarName.js');
var csv = require('csv/lib');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var localEmitter = new EventEmitter();
var filename;
var callerEmitter;
var tablename_alpha;
var tablename_numeric;
var arrPutItemsParams = []; //create an array for a flat process to iterate
var arrErrors = [];
var rowCount_successful = 0;
var rowCount_fail = 0;
//TABLE-LOADER.TS WORKS LOCALLY BUT FAILS ON AWS AMI. I THINK IT FAILS
//DUE TO CREDENTIALS FOR DYNAMODB AND S3 BEING MIXED UP IN A VOLLEY OF
//REQUESTS (SIMPLE INSERTS WORK ON AMI) AND A MIX OF INTERVALS, TIMEOUTS AND EMITS
//THIS VERSION IS GOING TO
//  1) NOT START INSERTING INTO DYNAMODB UNTIL ALL RECORDS ARE RECIEVED FROM S3
function load(filename, callerEmitterParam) {
    if (callerEmitterParam) {
        callerEmitter = callerEmitterParam;
    }
    else {
        callerEmitter = {
            emit: function () {
                console.log('fake callerEmitter');
            }
        };
    }
    var qdate = QDateModule.QDate.getQDateFromFileName(filename);
    tablename_alpha = qdate.tablename_alpha;
    tablename_numeric = qdate.tablename_numeric;
    console.log('tables: ', tablename_alpha, tablename_numeric);
    localEmitter.emit('start', filename);
}
exports.load = load;
var bS3LoadComplete = false;
var arrPutItemslastLength = 0;
var arrPutItemsTotalLength = 0;
var bPutEventsStarted = false;
var dtStartLoading;
var waitIteration = 0;
var counter = 0;
var IntervalMaster = setInterval(function () {
    var thisDate = new Date();
    counter++;
    //check to see if arrPutItemsLength is still growing
    var thisLength = arrPutItemsParams.length;
    if (bPutEventsStarted) {
        var totalElapsedseconds = (thisDate - dtStartLoading) / 1000;
        var totalRecordsInserted = arrPutItemsTotalLength - thisLength;
        var last10SecondsRecordsInserted = arrPutItemslastLength - thisLength;
        var recordsPerSecond = totalRecordsInserted / totalElapsedseconds;
        var recordsLeft = arrPutItemsTotalLength - totalRecordsInserted;
        var secondsLeft = recordsLeft / recordsPerSecond;
        console.log('last10secondsInserted:' + last10SecondsRecordsInserted +
            ' hoursLeft:' + secondsLeft / 60 / 60 +
            ' recordsLeft:' + recordsLeft);
    }
    if (!bPutEventsStarted) {
        console.log('intervalMaster - arrPutItemsParams.length', arrPutItemsParams.length, thisDate);
    }
    if (arrPutItemslastLength == thisLength && !bPutEventsStarted) {
        //kick of dynamodb load only after array has stopped growing
        arrPutItemsTotalLength = arrPutItemslastLength;
        dtStartLoading = new Date();
        bPutEventsStarted = true;
        console.log('bPutEventsStarted', bPutEventsStarted);
        waitIteration = counter;
    }
    if (counter > 10 && counter === waitIteration + 1) {
        console.log('waiting is over. BEGIN!');
        localEmitter.emit('ready-to-get-next-from-array');
    }
    arrPutItemslastLength = thisLength;
    if (arrPutItemsParams.length == 0) {
        console.log('arrPutItems is empty. Goodbye.', arrErrors.length, arrErrors);
        clearInterval(IntervalMaster);
    }
    if (arrErrors.length > 0) {
        console.log('there were some errors', arrErrors.length, arrErrors);
        clearInterval(IntervalMaster);
    }
}, 10000);
localEmitter.on('start', function (fname) {
    //console.log('xxxxx', csv.transform)
    var s3FilenameParams = {
        Bucket: 'fdic_stage_3',
        Key: fname
    };
    s3.getObject(s3FilenameParams).createReadStream()
        .pipe(csv.parse())
        .pipe(csv.transform(function (record) {
        var row = {
            rownumber: record[0],
            VarName_cert: record[1],
            repdte: record[2],
            Value: record[3],
            VarName: getVarName(record[4]),
            cert: record[5]
        };
        //console.log('row', row);
        localEmitter.emit('row-parsed-from-s3-file', row);
    }));
    setTimeout(function () {
        console.log('ROW ITERATION IS COMPLET. arrPutItemsParams has', arrPutItemsParams.length);
        localEmitter.emit('ready-to-get-next-from-array');
    }, 50);
});
localEmitter.on('row-parsed-from-s3-file', function (row) {
    //console.log('in row-parsed-from-s3-file', row)
    var glossaryItem = getGlossaryItemByVarName.getGlossaryItemByVarName(row.VarName, row.Value);
    var val = row.Value;
    if (glossaryItem.AON == 'numeric' && !isNumber(row.Value)) {
        val = '-9';
    }
    if (glossaryItem.AON == 'alpha' && row.Value == '') {
        val = 'ddEmpty';
    }
    var varName = row.VarName.replace('.', '_'); //'inst.webaddr' is an invalid attribute name in dynamodb
    pushToItemsArray(glossaryItem.AON == 'numeric' ? tablename_numeric : tablename_alpha, varName, val, row.cert);
});
function getVarName(vname) {
    if (vname === 'name') {
        return 'bankName';
    }
    return vname;
}
function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
function pushToItemsArray(tablename, varName, ddval, cert) {
    var arrTableNameParts = tablename.split("-");
    var tableSuffix = arrTableNameParts[arrTableNameParts.length - 1];
    var ddvalObj = tableSuffix == "ALPHA" ? { S: ddval } : { N: ddval };
    var itemParams = {
        TableName: tablename,
        Item: {
            varname: { S: varName },
            ddval: ddvalObj,
            cert: { N: cert }
        }
    };
    //console.log('loadFdicRow itemParams', itemParams);
    if (tableSuffix == "ALPHA") {
        arrPutItemsParams.push(itemParams);
    }
}
;
localEmitter.on('ready-to-run-putItem', function (itemsparam) {
    //console.log('in ready-to-run-putItem about to call dynamodb',itemsparam);
    //console.log(itemsparam);
    dynamodb.putItem(itemsparam, function (err, data) {
        if (err) {
            arrErrors.push({ err: err, itemsparam: itemsparam });
            console.log('err', err, itemsparam);
            throw ('check this out');
        }
        else {
            // console.log('ready-to-run-putItem data', data);
            localEmitter.emit('ready-to-get-next-from-array');
        }
    });
});
localEmitter.on('ready-to-get-next-from-array', function () {
    var itemsCount = arrPutItemsParams.length;
    if (itemsCount > 0) {
        var nextItems = arrPutItemsParams.pop();
        //console.log('in ready-to-get-next-from-array',nextItems)
        localEmitter.emit('ready-to-run-putItem', nextItems);
    }
});
//var x = { TableName: 'FDIC-2012-12-31-ALPHA',
//Item:
//{ varname: { S: 'inst_webaddr' },
//    ddval: { S: 'http://www.zionsbank.com' },
//    cert: { N: '2270' } } };
//dynamodb.putItem(x,function(err,data){
//    console.log('err',err);
//    console.log('data',data);
//})
//
//console.log(x);
//dynamodb.putItem(x, function (err, data) {
//    console.log(err);
//    console.log(data);
//});
load('All_Reports_20121231_Bank Assets Sold and Securitized.csv');
//# sourceMappingURL=table-loader1.js.map