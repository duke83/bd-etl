'use strict';
import *  as FdicFileJobMakerModule from "./job-maker";
import * as TablePreparerModule from "./table-preparer"

var AWS = require("aws-sdk");
var EventEmitter = require('events');
var emitter = new EventEmitter();


export class BdETL {
    //FdicFileJobMaker = FdicFileJobMaker;
    private _s3;
    private _sqs;
    private _dynamoDocClient; //http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
    private _currentFileName=null;

    constructor(config) {
        this._s3 = new AWS.S3(config.s3Config);
        this._sqs = new AWS.SQS(config.sqsConfig);
        this._dynamoDocClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig)
    };

    makeFdicFileJobs() {
        //var maker = new FdicFileJobMakerModule.JobMaker()
        return 'maker.make()';
    }

    processFiles(){
        while(this.getNextFile()){
            this.processFile();
        }
    }
    getNextFile(){
        switch(this._currentFileName){
            case null:
                this._currentFileName ='All_Reports_20131231_Net+Loans+and+Leases.csv';
                return true;
            case 'file1.csv':
                this._currentFileName ='All_Reports_20111231_Net+Loans+and+Leases.csv';
                return true;

        }
        return false;
    }
    processFile(){
        let tablePreparer = new TablePreparerModule.TablePreparer(this._currentFileName, emitter);
        console.log(this._currentFileName);
    }
}
