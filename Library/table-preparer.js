/// <reference path="../typings/node.d.ts" />
'use strict';
var QDate_1 = require("./QDate");
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
var etlState = require('./bd-etl-state.js');
class TablePreparer {
    constructor(filename) {
        this._alpha_build_complete = false;
        this._numeric_build_complete = false;
        this._filename = filename;
        this._qdate = QDate_1.QDate.getQDateFromFileName(filename);
        var datestring = this._qdate.string;
        this._alpha_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-ALPHA';
        this._numeric_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-NUM';
    }
    prepareTables(cb) {
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
                });
            }
        });
        //NUMERIC TABLE BUILD
        let tb_numeric = new TableBuilder(this._numeric_table_name, TableType.numeric);
        tb_numeric.build(function (data) {
            console.log('tb_numeric.build returned data', data);
            if (data) {
                tb_numeric.maximize(function (data) {
                    numeric_maximize_complete = data;
                });
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
    isSchemaValid_alpha(tablename, tableType, cb) {
        var params = {
            TableName: 'FDIC-1992-12-31-ALPHA' /* required */
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err)
                console.log(err, err.stack); // an error occurred
            else {
                //check attributes on data object
                console.log(data);
            }
        });
    }
    filename() {
        return this._filename;
    }
}
exports.TablePreparer = TablePreparer;
class TableBuilder {
    constructor(tablename, tableType, writeCapacity) {
        this._alpha_schema = {
            "AttributeDefinitions": [{ "AttributeName": "cert", "AttributeType": "N" }, {
                    "AttributeName": "ddval",
                    "AttributeType": "S"
                }, { "AttributeName": "varname", "AttributeType": "S" }],
            "TableName": this._table_name,
            "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                    "AttributeName": "cert",
                    "KeyType": "RANGE"
                }],
            "ProvisionedThroughput": { "ReadCapacityUnits": 1, "WriteCapacityUnits": this._writeCapcity },
            "LocalSecondaryIndexes": [{
                    "IndexName": "ddval-index",
                    "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                            "AttributeName": "ddval",
                            "KeyType": "RANGE"
                        }],
                    "Projection": { "ProjectionType": "ALL" },
                }]
        };
        this._numeric_schema = {
            "AttributeDefinitions": [{
                    "AttributeName": "cert",
                    "AttributeType": "N"
                }, { "AttributeName": "ddval", "AttributeType": "N" }, {
                    "AttributeName": "varname",
                    "AttributeType": "S"
                }],
            "TableName": this._table_name,
            "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                    "AttributeName": "cert",
                    "KeyType": "RANGE"
                }],
            "ProvisionedThroughput": { "ReadCapacityUnits": 1, "WriteCapacityUnits": this._writeCapcity },
            "LocalSecondaryIndexes": [{
                    "IndexName": "ddval-index",
                    "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                            "AttributeName": "ddval",
                            "KeyType": "RANGE"
                        }],
                    "Projection": { "ProjectionType": "ALL" },
                }]
        };
        // TABLESTATE OBJECT IS NECESSARY BECAUSE THE INTERVAL LOOP LOSES REFERENCE
        // TO THE CLASS METHODS AND PROPERTIES
        this._table_name = tablename;
        this._table_type = tableType;
        this._writeCapcity = writeCapacity;
        this._tableState = {
            tableType: tableType,
            startTime: Date.now(),
            tableName: tablename,
            tableExists: false,
            tableSchema: {},
            schemaValid: false,
            secondsForTO: 20,
            tableBeingCreated: false,
            methods: {
                getTableSchema: this.getTableSchema,
                createTable_alpha: this.createTable_alpha,
                createTable_numeric: this.createTable_numeric
            }
        };
    }
    //CB SHOULD CONTAIN TRUE AFTER TABLE EXISTS AND SCHEMA IS VALIDATED
    build(cb) {
        console.log('build', this._table_type, this._table_name);
        //
        let interval_TableExists = setInterval(function (state) {
            var elapsedTime = Date.now() - state.startTime;
            //console.log('interval_TableExists', elapsedTime / 1000, state);
            //TABLE DOES NOT EXIST
            if (!state.tableExists && !state.tableBeingCreated) {
                state.methods.getTableSchema(state.tableName, function (tableExists, tableSchema) {
                    if (tableExists) {
                        let tableStatus = tableSchema.Table.TableStatus;
                        console.log('tableStatus', tableStatus);
                        state.tableExists = true;
                        state.tableSchema = tableSchema;
                    }
                    if (!tableExists) {
                        state.tableBeingCreated = true;
                        state.tableType == TableType.alpha ?
                            state.methods.createTable_alpha(state.tableName) :
                            state.methods.createTable_numeric(state.tableName);
                    }
                });
            }
            //TABLE IS BEING CREATED - CHECK TO SEE IF COMPLETE
            if (state.tableBeingCreated) {
                console.log('checking to see if table created yet', state.tableName);
                state.methods.getTableSchema(state.tableName, function (tableExists, tableSchema) {
                    if (tableExists) {
                        let tableStatus = tableSchema.Table.TableStatus;
                        state.tableExists = true;
                        state.tableBeingCreated = false;
                        state.tableSchema = tableSchema;
                    }
                });
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
    maximize(cb) {
        cb(true);
        return;
    }
    createTable_alpha(tablename, cb) {
        var params = this._alpha_schema;
        dynamodb.createTable(params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                cb(err);
            } // an error occurred
            else {
                cb(data);
                console.log(data);
            } // successful response
        });
        //Only one table with secondary indexes can be in the CREATING state at any given time.
        console.log('creating alpha talbe ', tablename);
        //this._alpha_schema
    }
    createTable_numeric(tablename, cb) {
        //Only one table with secondary indexes can be in the CREATING state at any given time.
        console.log('creating numeric table ', tablename);
    }
    //GETTABLESCHEMA CALLBACK INCLUDES 1) TRUE IF TABLE EXISTS 2) SCHEMA
    getTableSchema(tableName, cb) {
        let params = {
            TableName: tableName
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err) {
                console.log('dynamodb.describeTable err', err, params);
                cb('');
            }
            if (data) {
                cb(true, data);
            }
            return;
        });
    }
}
class TableType {
    constructor(value) {
        this.value = value;
    }
    toString() {
        return this.value;
    }
}
TableType.alpha = new TableType('alpha');
TableType.numeric = new TableType('numeric');
var startime = Date.now();
function createTable_alpha(tablename, writeCapacity) {
    var params = {
        "AttributeDefinitions": [{ "AttributeName": "cert", "AttributeType": "N" }, {
                "AttributeName": "ddval",
                "AttributeType": "S"
            }, { "AttributeName": "varname", "AttributeType": "S" }],
        "TableName": tablename,
        "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                "AttributeName": "cert",
                "KeyType": "RANGE"
            }],
        "ProvisionedThroughput": { "ReadCapacityUnits": 1, "WriteCapacityUnits": writeCapacity },
        "LocalSecondaryIndexes": [{
                "IndexName": "ddval-index",
                "KeySchema": [{ "AttributeName": "varname", "KeyType": "HASH" }, {
                        "AttributeName": "ddval",
                        "KeyType": "RANGE"
                    }],
                "Projection": { "ProjectionType": "ALL" },
            }]
    };
    dynamodb.createTable(params, function (err, data) {
        if (err)
            console.log(err, err.stack); // an error occurred
        else
            console.log(data); // successful response
    });
}
function describet(tablename) {
    var params = {
        TableName: tablename
    };
    dynamodb.describeTable(params, function (err, data) {
        if (err)
            console.log(err, err.stack); // an error occurred
        else {
            //check attributes on data object
            console.log(data);
        }
    });
}
var tablename = 'Aaaxxxxx1';
//createTable_alpha(tablename,1000);
describet(tablename);
dynamodb.des;
//var tp = new TablePreparer(filename);
//tp.prepareTables(function (data) {
//    console.log(data)
//}) 
//# sourceMappingURL=table-preparer.js.map