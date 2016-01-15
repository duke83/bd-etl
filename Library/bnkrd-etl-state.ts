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
var docClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var params = {
    TableName: 'FDIC-1992-12-31-ALPHA' /* required */
};
//dynamodb.describeTable(params, function(err, data) {
//    if (err) console.log(err, err.stack); // an error occurred
//    else     console.log(data);           // successful response
//});


export function updateProcessingState(qdate:string, filename:string, processState:ProcessState) {
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
        if (err) console.log(err);
        else console.log(data);
    })
}

export function quarterIsBeingProcessed(qdate:string, cb) {
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
        if (err) throw(err);
        if (data.Items.length > 0) {
            cb(true)
        }
        else {
            cb(false)
        }
        ;
    });

}

// When creating tables with secondary indexes, only one can be
// in 'creating' state at any given time. (http://docs.aws.amazon.com/awsjavascriptsdk/latest/aws/dynamodb.html#createtable-property)
// Additionally, The number of concurrent table requests (cumulative number of tables in the CREATING, DELETING or UPDATING state) exceeds the maximum allowed of 10.
// (http://docs.aws.amazon.com/amazondynamodb/latest/APIReference/API_UpdateTable.html)
export function tableUpdate_start(tablename, tablestatus:TableState) {
    var params = {
        TableName: 'bd-etl-table-status',
        Item: {
            tableStatus: tablestatus.toString(),
            tableName: tablename
        }
    };
    docClient.put(params, function (err, data) {
        if (err) console.log(err);
        else console.log(data);
    })
}

export function tableUpdate_complete(tablename, tablestatus:TableState) {
    var params = {
        Key: {
            tableStatus: tablestatus.toString(),
            tableName: tablename
        },
        TableName: 'bd-etl-table-status',
    };
    docClient.delete(params, function (err, data) {
        if (err) console.log(err);
        else console.log(data);
    })
}

export function tablesCreating_count() {
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
        if (err) throw(err);
        console.log(data.Count)
    });
}

export function tablesInProcss_count(cb) {
    var params = {
        TableName: 'bd-etl-table-status',

    };
    docClient.scan(params, function (err, data) {
        if (err) throw(err);
        cb(data.Count);
    });
}

export function tablesInProcss_reset(cb) {
    var params = {
        TableName: 'bd-etl-table-status',

    };
    docClient.scan(params, function (err, data) {
        if (err) throw(err);
        cb(data.Count);
    });
}

export function takeTableOutOfProcess(tablename,cb){
    var params = {
        Key: { /* required */
            tableStatus: "UPDATING"
        },
        TableName:"bd-etl-table-status"

    }
    docClient.delete(params, function(err, data) {
        if (err) console.log(err, err.stack); // an error occurred
        else     console.log(data);           // successful response
    });
}

export class ProcessState {
    constructor(public value:string) {
    }

    toString() {
        return this.value
    }

    static startingToProcess = new ProcessState('startingToProcess');
    static finishedProcessing = new ProcessState('finishedProcessing');
}

export class TableState {
    constructor(public value:string) {
    }

    toString() {
        return this.value
    }

    static CREATING = new ProcessState('CREATING');
    static DELETING = new ProcessState('DELETING');
    static UPDATING = new ProcessState('UPDATING');
}


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

takeTableOutOfProcess("testttable_1A",function(data){
    console.log(data)
})