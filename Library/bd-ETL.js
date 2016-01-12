'use strict';
var TablePreparerModule = require("./table-preparer");
var AWS = require("aws-sdk");
var EventEmitter = require('events');
//var emitter = new EventEmitter();
class BdETL {
    constructor() {
        this._currentFileName = null;
        this._emitter = new EventEmitter();
        this.files = [
            { filename: 'All_Reports_20141231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20131231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20121231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20111231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20101231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20091231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20081231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20071231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20061231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20051231_Net+Loans+and+Leases.csv', recordCount: 40 },
            { filename: 'All_Reports_20041231_Net+Loans+and+Leases.csv', recordCount: 40 }
        ];
        // this._s3 = new AWS.S3(config.s3Config);
        // this._sqs = new AWS.SQS(config.sqsConfig);
        // this._dynamoDocClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig)
    }
    ;
    makeFdicFileJobs() {
        //var maker = new FdicFileJobMakerModule.JobMaker()
        return 'maker.make()';
    }
    processFiles() {
        var func = this.processFile;
        for (var i = 0; i < this.files.length; i++) {
            let fname = this.files[i].filename;
            setTimeout(function () {
                func(fname);
            }, 0); //this encompasses many asynchronous calls. The loop continues
        }
    }
    getNextFile() {
        //console.log(this.files[11])
        var rtrn = this.files[this.files.length - 1].filename;
        this.files.pop();
        return rtrn;
    }
    processFile(filename) {
        let tablePreparer = new TablePreparerModule.TablePreparer(filename, 1);
        //var emmiter = this._emitter
        tablePreparer.prepareTables(function (data) {
            if (data == 'ready') {
                console.log('tables-are-ready', filename);
            }
        });
    }
}
exports.BdETL = BdETL;
var etl = new BdETL();
etl.processFiles();
//# sourceMappingURL=bd-ETL.js.map