'use strict';
var AWS = require("aws-sdk");
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
                this._currentFileName = 'file1.csv';
                return true;
            case 'file1.csv':
                this._currentFileName = 'file2.csv';
                return true;
        }
        return false;
    }
    processFile() {
        let tablePreparer = new console.log(this._currentFileName);
    }
}
exports.BdETL = BdETL;
//# sourceMappingURL=bd-etl.js.map