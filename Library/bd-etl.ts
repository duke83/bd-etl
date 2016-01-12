'use strict';
import *  as FdicFileJobMakerModule from "./job-maker";
import * as TablePreparerModule from "./table-preparer";

var AWS = require("aws-sdk");
var EventEmitter = require('events');
//var emitter = new EventEmitter();


export class BdETL {
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

    processFiles() {
        var func = this.processFile;
        for (var i = 0; i < this.files.length; i++) {
            let fname = this.files[i].filename;
            setTimeout(function () {
                func(fname)
            }, 0);//this encompasses many asynchronous calls. The loop continues
        }
    }


    private files = [
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

    getNextFile():string {
        //console.log(this.files[11])
        var rtrn = this.files[this.files.length - 1].filename;
        this.files.pop()
        return rtrn;
    }

    private
    processFile(filename) {
        let tablePreparer = new TablePreparerModule.TablePreparer(filename, 1);
        //var emmiter = this._emitter
        tablePreparer.prepareTables(function (data) {
            if (data == 'ready') {

                console.log('tables-are-ready', filename)
            }
        });
    }
}

var etl = new BdETL();
etl.processFiles();