/// <reference path="../typings/node.d.ts" />
'use strict';
var QDate_1 = require("./QDate");
var config = require("./config.js");
var AWS = require('aws-sdk');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var emitter = new EventEmitter();
class TablePreparer {
    constructor(filename, writeCapacity) {
        this._alpha_build_complete = false;
        this._numeric_build_complete = false;
        this._write_capacity = 1;
        this._filename = filename;
        this._write_capacity = writeCapacity ? writeCapacity : 1;
        this._qdate = QDate_1.QDate.getQDateFromFileName(filename);
        var datestring = this._qdate.string;
        this._alpha_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-ALPHA';
        this._numeric_table_name = 'FDIC-' + datestring.substring(0, 4) + '-' + datestring.substring(4, 6) + '-' + datestring.substring(6, 8) + '-NUM';
    }
    prepareTables(cb) {
        let startTime = Date.now();
        let secondsToTimeout = 20;
        let alpha_complete = false;
        let numeric_complete = false;
        //ALPHA TABLE BUILD
        let tb_alpha = new TableBuilder(this._alpha_table_name, TableType.alpha, this._write_capacity);
        tb_alpha.build(function (data) {
            if (data) {
                alpha_complete = true;
            }
        });
        //NUMERIC TABLE BUILD
        let tb_numeric = new TableBuilder(this._numeric_table_name, TableType.numeric, this._write_capacity);
        tb_numeric.build(function (data) {
            if (data) {
                numeric_complete = true;
            }
        });
        //START POLLING
        let interval_mainLoop = setInterval(function () {
            var elapsedTime = Date.now() - startTime;
            console.log('interval_mainLoop', elapsedTime / 1000);
            //HAPPY PATH
            if (alpha_complete && numeric_complete) {
                console.log('happy path has been reached. Now cb(ready)');
                clearInterval(interval_mainLoop);
                cb('ready');
                return;
            }
            //TIMEOUT LIMIT IS REACHED
            if (elapsedTime / 1000 >= secondsToTimeout) {
                clearInterval(interval_mainLoop);
                cb(false);
                return;
            }
        }, 5000);
    }
    isSchemaValid_alpha(tablename, tableType, cb) {
        var params = {
            TableName: 'FDIC-1992-12-31-ALPHA' /* required */
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err)
                console.log('dynamodb.describeTable err', err, err.stack); // an error occurred
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
            "ProvisionedThroughput": { "ReadCapacityUnits": 1, "WriteCapacityUnits": this._writeCapacity },
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
            "ProvisionedThroughput": { "ReadCapacityUnits": 1, "WriteCapacityUnits": this._writeCapacity },
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
        this._writeCapacity = writeCapacity;
        this._tableState = {
            tableType: tableType,
            startTime: Date.now(),
            tableName: tablename,
            tableExists: false,
            alpha_schema: this._alpha_schema,
            numeric_schema: this._numeric_schema,
            writeCapacity: writeCapacity,
            schemaValid: false,
            secondsForTO: 20,
            tableBeingCreated: false,
            methods: {
                getTableSchema: this.getTableSchema,
                createTable: this.createTable,
            }
        };
    }
    //CB SHOULD CONTAIN TRUE AFTER TABLE EXISTS AND SCHEMA IS VALIDATED
    build(cb) {
        console.log('build', this._table_type, this._table_name);
        var tableState = this._tableState;
        tableState.cb = cb;
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
                            state.methods.createTable(state.tableName, state.alpha_schema, state.writeCapacity) :
                            state.methods.createTable(state.tableName, state.numeric_schema, state.writeCapacity);
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
                console.log('TableBuilder.build() has timed out', tableState);
                clearInterval(interval_TableExists);
            }
            //STOP POLLING IF CRITERIA HAVE BEEN SATISFIED
            if (state.tableExists) {
                console.log('TableBuilder.build() SUCCESS. about to cb(true)', state.tableName);
                state.cb(true);
                clearInterval(interval_TableExists);
                return;
            }
        }, 5000, tableState);
    }
    //MAXIMIZE SHOULD RETURN TRUE ONCE THE WRITE CAPACITY IS SET AND STATE IS STABILIZED
    maximize(cb) {
        cb(true);
        return;
    }
    static updateThroughputCapacity(tableName, readcapacity, writecapacity) {
        var params = {
            "TableName": tableName,
            "ProvisionedThroughput": {
                "ReadCapacityUnits": readcapacity,
                "WriteCapacityUnits": writecapacity
            }
        };
        dynamodb.updateTable(params, function (err, data) {
            if (err)
                console.log(err, err.stack); // an error occurred
            else
                console.log('succesfully updated write capacity', data); // successful response
        });
    }
    createTable(tablename, schema, writeCapacity) {
        var params = schema;
        params.TableName = tablename;
        params.ProvisionedThroughput.WriteCapacityUnits = writeCapacity;
        //console.log('createTable params', params);
        dynamodb.createTable(params, function (err, data) {
            if (err) {
                console.log(err, err.stack);
                //cb(err)
                console.log('createTable returned error from AWS', err);
            } // an error occurred
            else {
            } // successful response
        });
        //Only one table with secondary indexes can be in the CREATING state at any given time.
        console.log('creating table ', tablename);
        //this._alpha_schema
    }
    //GETTABLESCHEMA CALLBACK INCLUDES 1) TRUE IF TABLE EXISTS 2) SCHEMA
    getTableSchema(tableName, cb) {
        let params = {
            TableName: tableName
        };
        dynamodb.describeTable(params, function (err, data) {
            if (err) {
                //table not found
                cb('');
            }
            if (data) {
                //table exists, return true and the table schema.
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
function deleteTables() {
    var params = {
        ExclusiveStartTableName: 'FDIC-',
        Limit: 50
    };
    dynamodb.listTables(params, function (err, data) {
        if (err)
            console.log('dynamodb.listTables err', err, err.stack); // an error occurred
        else {
            emitter.emit('fdic-table-list-complete', data);
        }
    });
    emitter.on('fdic-table-list-complete', function (data) {
        console.log('emitter.on...', data);
        var tableCountBeingDeleted = 0;
        console.log('data.TableNames.length', data.TableNames.length);
        var deleteTableCallback = function (err, rslt) {
            if (err) {
                console.log('deleteTable callback from deleteTables', err);
            }
            if (rslt) {
                tableCountBeingDeleted--;
                console.log('success in deleteTable callback', rslt);
            }
        };
        for (let i = 0; i < data.TableNames.length; i++) {
            console.log('data.TableNames[i].substring(0, 5)', data.TableNames[i].substring(0, 5));
            var intervalSlowItDown;
            if (data.TableNames[i].substring(0, 5) === "FDIC-") {
                console.log('in the loop', i, data.TableNames[i]);
                if (tableCountBeingDeleted > 8) {
                    intervalSlowItDown = setInterval(function () {
                        tableCountBeingDeleted++;
                        console.log('tableCountBeingDeleted', tableCountBeingDeleted);
                        deleteTable(data.TableNames[i], deleteTableCallback);
                    }, 5000);
                }
                if (tableCountBeingDeleted <= 8) {
                    clearInterval(intervalSlowItDown);
                    tableCountBeingDeleted++;
                    console.log('tableCountBeingDeleted', tableCountBeingDeleted);
                    deleteTable(data.TableNames[i], deleteTableCallback);
                }
                if (tableCountBeingDeleted == 0) {
                    clearInterval(intervalSlowItDown);
                }
            }
        }
    });
}
;
function deleteTable(tableName, cb) {
    var params = {
        TableName: tableName
    };
    dynamodb.deleteTable(params, function (err, data) {
        if (err) {
            cb(err, null);
        }
        else
            cb(null, data); // successful response
    });
}
//var filename = 'All_Reports_20121231_Net+Loans+and+Leases.csv';
//var tp = new TablePreparer(filename, 15);
//tp.prepareTables(function (data) {
//    console.log("preparTables returns:",data)
//});
//TableBuilder.updateThroughputCapacity("FDIC-2012-12-31-NUM",1,1);
//deleteTables(); 
//# sourceMappingURL=table-preparer.js.map