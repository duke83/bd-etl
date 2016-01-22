/// <reference path="../typings/node.d.ts" />
'use strict';
var QDateModule = require('./QDate');
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var localEmitter = new EventEmitter();
var glossaryData = require('./fdicGlossaryData.js');
var filename;
var callerEmitter;
var tablename_alpha;
var tablename_numeric;
function load(filename, callerEmitterParam) {
    if (callerEmitterParam) {
        callerEmitter = callerEmitterParam;
    }
    var qdate = QDateModule.QDate.getQDateFromFileName(filename);
    tablename_alpha = qdate.tablename_alpha;
    tablename_numeric = qdate.tablename_numeric;
    localEmitter.emit('start', filename);
}
exports.load = load;
localEmitter.on('start', function (fname) {
    console.log('table-loader is runing start event', fname);
    callerEmitter.emit('table-load-is-complete', fname);
});
function getGlossaryItemByVarName(srch) {
    var glossaryItems = glossaryData.getGlossaryData();
    for (var i = 0; i <= glossaryItems.length; i++) {
        if (glossaryItems[i] && glossaryItems[i].VarName.toUpperCase() === srch.toUpperCase()) {
            return glossaryItems[i];
        }
    }
    return;
}
function loadFdicRow(tablename, varName, ddval, cert) {
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
    dynamodb.putItem(itemParams, function (err, data) {
        if (err) {
            console.log('error in loadFdicRow_Alpha', itemParams, err);
            throw (itemParams, err);
        }
        else {
            // successful response
            //if (itemParams.Item.varname === 'docket') {
            //    throw('what they hey!? isnt docket numeric?', itemParams)
            //}
            ///return data;
            return;
        }
    });
}
//# sourceMappingURL=table-loader.js.map