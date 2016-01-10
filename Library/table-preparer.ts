/// <reference path="../typings/node.d.ts" />
'use strict';
import {QDate} from "./QDate";
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
var etlState=require('./bd-etl-state.js')
//console.log(etlState);

etlState.tablesInProcss_count(function(data){
    console.log(data)
})

export class TablePreparer {
    private _filename;
    private _qdate:QDate;
    private _alpha_table_name:string;
    private _alpha_build_complete = false;
    private _numeric_table_name:string;
    private _numeric_build_complete = false;


    constructor(filename:string) {
        this._filename = filename;
        this._qdate = QDate.getQDateFromFileName(filename);
        var datestring = this._qdate.string;
        this._alpha_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-ALPHA';
        this._numeric_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-NUM';
    }

    public prepareTables(cb) {
        let startTime = Date.now();
        let secondsToTimeout = 20;
        let alpha_maximize_complete = false;
        let numeric_maximize_complete = false;

        //ALPHA TABLE BUILD
        let tb_alpha = new TableBuilder(this._alpha_table_name, TableType.alpha);
        tb_alpha.build(function (data) {
            console.log('tb_alpha.build returned data', data);
            if (data) {
                tb_alpha.maximize(function (data) {
                    alpha_maximize_complete = data;
                })
            }
        });

        //NUMERIC TABLE BUILD
        let tb_numeric = new TableBuilder(this._numeric_table_name, TableType.numeric);
        tb_numeric.build(function (data) {
            console.log('tb_numeric.build returned data', data);
            if (data) {
                tb_numeric.maximize(function (data) {
                    numeric_maximize_complete = data;
                })
            }
        });

        //START POLLING
        let interval_mainLoop = setInterval(function () {

            var elapsedTime = Date.now() - startTime;
            console.log('interval_mainLoop', elapsedTime / 1000);

            //HAPPY PATH
            if (alpha_maximize_complete && numeric_maximize_complete) {
                cb('ready');
            }

            //TIMEOUT LIMIT IS REACHED
            if (elapsedTime / 1000 >= secondsToTimeout) {
                clearInterval(interval_mainLoop);
                return;
            }
        }, 10000);
    }


    public isSchemaValid_alpha(tablename, tableType:TableType, cb) {
        var params = {
            TableName: 'FDIC-1992-12-31-ALPHA' /* required */
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err) console.log(err, err.stack); // an error occurred

            // successful response
            else {
                //check attributes on data object
                console.log(data);
            }
        });
    }


    get
    filename() {
        return this._filename;
    }


}

class TableBuilder {
    private _tableState;
    private _table_type:TableType;
    private _table_name;
    private _alpha_schema = {
        "Table": {
            "AttributeDefinitions": [{"AttributeName": "cert", "AttributeType": "N"}, {
                "AttributeName": "ddval",
                "AttributeType": "S"
            }, {"AttributeName": "varname", "AttributeType": "S"}],
            "TableName": this._table_name,
            "KeySchema": [{"AttributeName": "varname", "KeyType": "HASH"}, {
                "AttributeName": "cert",
                "KeyType": "RANGE"
            }],
            "ProvisionedThroughput": {"NumberOfDecreasesToday": 0, "ReadCapacityUnits": 1, "WriteCapacityUnits": 1},
            "LocalSecondaryIndexes": [{
                "IndexName": "ddval-index",
                "KeySchema": [{"AttributeName": "varname", "KeyType": "HASH"}, {
                    "AttributeName": "ddval",
                    "KeyType": "RANGE"
                }],
                "Projection": {"ProjectionType": "ALL"},
            }]
        }
    };
    private  _numeric_schema = {
        "Table": {
            "AttributeDefinitions": [{
                "AttributeName": "cert",
                "AttributeType": "N"
            }, {"AttributeName": "ddval", "AttributeType": "N"}, {
                "AttributeName": "varname",
                "AttributeType": "S"
            }],
            "TableName": this._table_name,
            "KeySchema": [{"AttributeName": "varname", "KeyType": "HASH"}, {
                "AttributeName": "cert",
                "KeyType": "RANGE"
            }],
            "ProvisionedThroughput": {"NumberOfDecreasesToday": 0, "ReadCapacityUnits": 1, "WriteCapacityUnits": 1},
            "LocalSecondaryIndexes": [{
                "IndexName": "ddval-index",
                "KeySchema": [{"AttributeName": "varname", "KeyType": "HASH"}, {
                    "AttributeName": "ddval",
                    "KeyType": "RANGE"
                }],
                "Projection": {"ProjectionType": "ALL"},
            }]
        }
    };


    constructor(tablename:string, tableType:TableType) {
        // TABLESTATE OBJECT IS NECESSARY BECAUSE THE INTERVAL LOOP LOSES REFERENCE
        // TO THE CLASS METHODS AND PROPERTIES
        this._table_name = tablename;
        this._table_type = tableType;
        this._tableState = {
            tableType: tableType,
            startTime: Date.now(),
            tableName: tablename,
            tableExists: false,
            tableSchema: {},
            schemaValid: false,
            secondsForTO: 20,
            tableBeingCreated:false,
            methods: {
                getTableSchema: this.getTableSchema,
                createTable_alpha: this.createTable_alpha,
                createTable_numeric: this.createTable_numeric
            }
        }
    }

    //CB SHOULD CONTAIN TRUE AFTER TABLE EXISTS AND SCHEMA IS VALIDATED
    public build(cb) {
        console.log('build', this._table_type, this._table_name);


        //
        let interval_TableExists = setInterval(function (state) {
            var elapsedTime = Date.now() - state.startTime;

            //console.log('interval_TableExists', elapsedTime / 1000, state);

            //TABLE DOES NOT EXIST
            if (!state.tableExists && !state.tableBeingCreated) {
                state.methods.getTableSchema(state.tableName, function (tableExists:boolean, tableSchema:any) {
                    if (tableExists) {
                        let tableStatus = tableSchema.Table.TableStatus;
                        console.log('tableStatus',tableStatus)
                        state.tableExists = true;
                        state.tableSchema = tableSchema;
                        //console.log(JSON.stringify(tableSchema))
                    }
                    if (!tableExists) {
                        state.tableBeingCreated=true;
                        state.tableType == TableType.alpha ?
                            state.methods.createTable_alpha(state.tableName) :
                            state.methods.createTable_numeric(state.tableName)
                    }
                })
            }

            //TABLE IS BEING CREATED - CHECK TO SEE IF COMPLETE
            if (state.tableBeingCreated){
                console.log('checking to see if table created yet', state.tableName)
                state.methods.getTableSchema(state.tableName, function (tableExists:boolean, tableSchema:any) {
                    if (tableExists) {
                        let tableStatus = tableSchema.Table.TableStatus;
                        state.tableExists = true;
                        state.tableBeingCreated=false;
                        state.tableSchema = tableSchema;
                    }
                })
            }

            //STOP POLLING IF TIMEOUT LIMIT IS REACHED
            if (elapsedTime / 1000 >= state.secondsForTO) {
                clearInterval(interval_TableExists);
            }

            //STOP POLLING IF CRITERIA HAVE BEEN SATISFIED
            if (state.tableExists && state.schemaValid) {
                state.cb(true);
                clearInterval(interval_TableExists);
                return;
            }
        }, 5000, this._tableState);
    }

    //MAXIMIZE SHOULD RETURN TRUE ONCE THE WRITE CAPACITY IS SET AND STATE IS STABILIZED
    public maximize(cb) {
        cb(true);
        return;
    }

    private createTable_alpha(tablename,cb) {
        //Only one table with secondary indexes can be in the CREATING state at any given time.
        console.log('creating alpha talbe ', tablename)
        //this._alpha_schema
    }

    private createTable_numeric(tablename,cb) {
        //Only one table with secondary indexes can be in the CREATING state at any given time.
        console.log('creating numeric table ', tablename)
    }

    //GETTABLESCHEMA CALLBACK INCLUDES 1) TRUE IF TABLE EXISTS 2) SCHEMA
    private getTableSchema(tableName:string, cb) {
        let params = {
            TableName: tableName
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err) {
                console.log('dynamodb.describeTable err', err, params);
                cb('')
            }
            if (data) {
                cb(true, data)
            }
            return;
        })
    }
}

class TableType {
    constructor(public value:string) {
    }

    toString() {
        return this.value
    }

    static alpha = new TableType('alpha');
    static numeric = new TableType('numeric');
}


var filename = 'All_Reports_20121231_Net+Loans+and+Leases.csv';
//var tp = new TablePreparer(filename);
//tp.prepareTables(function (data) {
//    console.log(data)
//})