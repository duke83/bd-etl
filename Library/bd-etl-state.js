//state is shared between multiple instances of the ETL application
//via the bd-etl-state table (dynamodb)
/*
 {
 "alphaRecordCount": 0,
 "filename": "myfilename1.csv",
 "lastUpdated": "2016-01-06: 10:47",
 "numericRecordCount": 0,
 "qdate": "20011231",
 "state": "writing"
 }
 */
/// <reference path="../typings/node.d.ts" />
'use strict';
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var params = {
    TableName: 'FDIC-1992-12-31-ALPHA' /* required */
};
//dynamodb.describeTable(params, function(err, data) {
//    if (err) console.log(err, err.stack); // an error occurred
//    else     console.log(data);           // successful response
//});
function updateProcessingState(qdate, filename, processState) {
    //write a record to bd-etl-state (overwrite if already exists)
    var thisdate = new Date();
    var params = {
        TableName: 'bd-etl-state',
        Item: {
            "filename": filename,
            "lastUpdated": thisdate.getFullYear() + '-' + thisdate.getMonth() + 1 + '-' + thisdate.getDate() + ' ' + thisdate.getHours() + ':' + thisdate.getMinutes(),
            "qdate": qdate,
            "state": processState.toString()
        }
    };
    docClient.put(params, function (err, data) {
        if (err)
            console.log(err);
        else
            console.log(data);
    });
}
exports.updateProcessingState = updateProcessingState;
function quarterIsBeingProcessed(qdate, cb) {
    var params = {
        TableName: 'bd-etl-state',
        KeyConditions: {
            qdate: {
                ComparisonOperator: 'EQ',
                AttributeValueList: ['20121231']
            }
        },
        QueryFilter: {
            state: {
                ComparisonOperator: 'EQ',
                AttributeValueList: ['startingToProcess']
            }
        }
    };
    docClient.query(params, function (err, data) {
        if (err)
            throw (err);
        if (data.Items.length > 0) {
            cb(true);
        }
        else {
            cb(false);
        }
        ;
    });
}
// When creating tables with secondary indexes, only one can be
// in 'creating' state at any given time. (http://docs.aws.amazon.com/awsjavascriptsdk/latest/aws/dynamodb.html#createtable-property)
// Additionally, The number of concurrent table requests (cumulative number of tables in the CREATING, DELETING or UPDATING state) exceeds the maximum allowed of 10.
// (http://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTable.html)
function tableUpdate_start(tablename, tablestatus) {
    var params = {
        TableName: 'bd-etl-table-status',
        Item: {
            tableStatus: tablestatus.toString(),
            tableName: tablename
        }
    };
    docClient.put(params, function (err, data) {
        if (err)
            console.log(err);
        else
            console.log(data);
    });
}
function tableUpdate_complete(tablename, tablestatus) {
    var params = {
        Key: {
            tableStatus: tablestatus.toString(),
            tableName: tablename
        },
        TableName: 'bd-etl-table-status',
    };
    docClient.delete(params, function (err, data) {
        if (err)
            console.log(err);
        else
            console.log(data);
    });
}
function tablesCreating_count() {
    var params = {
        TableName: 'bd-etl-table-status',
        KeyConditions: {
            tableStatus: {
                ComparisonOperator: 'EQ',
                AttributeValueList: ['CREATING']
            }
        }
    };
    docClient.query(params, function (err, data) {
        if (err)
            throw (err);
        console.log(data.Count);
    });
}
function tablesInProcss_count(cb) {
    var params = {
        TableName: 'bd-etl-table-status',
    };
    docClient.scan(params, function (err, data) {
        if (err)
            throw (err);
        cb(data.Count);
    });
}
exports.tablesInProcss_count = tablesInProcss_count;
class ProcessState {
    constructor(value) {
        this.value = value;
    }
    toString() {
        return this.value;
    }
}
ProcessState.startingToProcess = new ProcessState('startingToProcess');
ProcessState.finishedProcessing = new ProcessState('finishedProcessing');
class TableState {
    constructor(value) {
        this.value = value;
    }
    toString() {
        return this.value;
    }
}
TableState.CREATING = new ProcessState('CREATING');
TableState.DELETING = new ProcessState('DELETING');
TableState.UPDATING = new ProcessState('UPDATING');
//console.log(new Date())
//updateProcessingState('20121231','def.csv',ProcessState.finishedProcessing);
//console.log(config.dynamodbConfig())
//function cb(data){
//    console.log(data)
//}
//quarterIsBeingProcessed('20121231',cb);
//tableUpdate_start('testttable_2A',TableState.UPDATING);
//tableUpdate_complete('testttable_2A',TableState.UPDATING);
//tablesCreating_count()
//tablesInProcss_count() 
//# sourceMappingURL=bd-etl-state.js.map