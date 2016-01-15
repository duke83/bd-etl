'use strict';
import *  as FdicFileJobMakerModule from "./job-maker";
import * as TablePreparerModule from "./table-preparer";

var AWS = require("aws-sdk");
var EventEmitter = require('events');
//var emitter = new EventEmitter();
var async = require('async');
var files = [
    {filename: 'All_Reports_20141231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20131231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20121231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20111231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20101231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20091231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20081231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20071231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20061231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20051231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20041231_Net+Loans+and+Leases.csv', recordCount: 40}
];

var fname=''

function getNextFile() {
    if(files.length>0) {
        var rtrn = files[files.length - 1].filename;
        files.pop();
        return rtrn;
    }
}

export  class BdETL {
    //FdicFileJobMaker = FdicFileJobMaker;
    private _s3;
    private _sqs;
    private _dynamoDocClient; //http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
    private _currentFileName = null;
    private _emitter = new EventEmitter();


    constructor() {
        // this._s3 = new AWS.S3(config.s3Config);
        // this._sqs = new AWS.SQS(config.sqsConfig);
        // this._dynamoDocClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig)
    };

    makeFdicFileJobs() {
        //var maker = new FdicFileJobMakerModule.JobMaker()
        return 'maker.make()';
    }



    processFilesWhilst() {
        //var fname = currentFilename;
        var processFile = this.processFile;
        ///var getNextFile = getNextFile;
        async.whilst(
            //test
            function () {
                fname=getNextFile();
                console.log('test fname', fname)
                if (fname.length > 0) {
                    return true;
                }
            },
            //run this every time test is true
            function (cb)//cb(error)
            {
                processFile(fname, function (cb1) {
                    if (cb1) {
                        console.log('myLongfunction returns', cb1);
                        cb(null, 'xx')
                    }
                    else {
                        console.log('muLongfunction no joy', cb1);
                        cb("got an error")
                    }
                })

            },
            //run this when test fails and/or repeated execution stops
            function (err, n) {
                console.log('err', err);
                console.log('n', n)
            }
        )
    }



    private processFile(filename, cb) {
        let tablePreparer = new TablePreparerModule.TablePreparer(filename, 1);
        tablePreparer.prepareTables(function (data) {
            if (data == 'ready') {
                console.log('tables-are-ready', filename);
                cb(true);
                return;
            }
        });
    }
}

var etl = new BdETL();
etl.processFilesWhilst();