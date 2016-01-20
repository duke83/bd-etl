/// <reference path="../typings/node.d.ts" />
'use strict';
import {QDate} from "./QDate";
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var emitter = new EventEmitter();


export class TableLoader {
    private _filename;

    constructor(filename:string) {
        this._filename = filename;
    }

}