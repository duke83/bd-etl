'use strict';
var TablePreparerModule = require("./table-preparer");
var AWS = require("aws-sdk");
var EventEmitter = require('events');
var emitter = new EventEmitter();
class BdETL {
    constructor(config) {
        this._currentFileName = null;
        this._s3 = new AWS.S3(config.s3Config);
        this._sqs = new AWS.SQS(config.sqsConfig);
        this._dynamoDocClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig);
    }
    ;
    makeFdicFileJobs() {
        //var maker = new FdicFileJobMakerModule.JobMaker()
        return 'maker.make()';
    }
    processFiles() {
        while (this.getNextFile()) {
            this.processFile();
        }
    }
    getNextFile() {
        switch (this._currentFileName) {
            case null:
                this._currentFileName = 'All_Reports_20131231_Net+Loans+and+Leases.csv';
                return true;
            case 'file1.csv':
                this._currentFileName = 'All_Reports_20111231_Net+Loans+and+Leases.csv';
                return true;
        }
        return false;
    }
    processFile() {
        let tablePreparer = new TablePreparerModule.TablePreparer(this._currentFileName, emitter);
        console.log(this._currentFileName);
    }
}
exports.BdETL = BdETL;
//# sourceMappingURL=bd-ETL.js.map