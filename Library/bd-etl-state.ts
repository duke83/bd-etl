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
import {QDate} from "./QDate";
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var params = {
    TableName: 'FDIC-1992-12-31-ALPHA' /* required */
};
//dynamodb.describeTable(params, function(err, data) {
//    if (err) console.log(err, err.stack); // an error occurred
//    else     console.log(data);           // successful response
//});


function startingToProcessFile(qdate:string,filename:string){
    //write a record to bd-etl-state (overwrite if already exists)
    var thisdate=new Date();

    var params = {
        TableName : 'bd-etl-state',
        Item: {
            "filename": filename,
            "lastUpdated": thisdate.getFullYear() + '-' + thisdate.getMonth()+1 + '-' + thisdate.getDate() + ' ' +
            thisdate.getHours() +':' + thisdate.getMinutes(),
            "qdate": qdate,
            "state": "starting-to-process"
        }
    };
    docClient.put(params,function(err,data){
        if (err) console.log(err);
        else console.log(data);
    })
}
//console.log(new Date())
startingToProcessFile('20121231','abc.csv');
//console.log(config.dynamodbConfig())