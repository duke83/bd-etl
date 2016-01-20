/// <reference path="../typings/node.d.ts" />
'use strict';
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var emitter = new EventEmitter();
class TableLoader {
    constructor(filename) {
        this._filename = filename;
    }
}
exports.TableLoader = TableLoader;
//# sourceMappingURL=table-loader.js.map