'use strict';
import *  as FdicFileJobMakerModule from "./job-maker";
import * as TablePreparerModule from "./table-preparer";
import * as TableLoaderModule from "./table-loader";
import * as JobMakerModule from "./job-maker";

var AWS = require("aws-sdk");
var EventEmitter = require('events');
var emitter = new EventEmitter();
var async = require('async');


var fname = ''

emitter.on('new-filename-retrieved-from-sqs', function (filename) {
    console.log('runing new-filename-retrieved-from-sql', filename)
    processFile(filename)
});

emitter.on('tables-are-prepared',function(filename){
    console.log('running tables-are-preapred',filename);
    loadFile(filename);
})

emitter.on('table-load-is-complete',function(filename){
    console.log('running table-load-is-complete',filename);
    emitter.emit('start')
});

emitter.on('start',function(){
    JobMakerModule.JobMaker.getNextRecord(function (data_fname) {
        if (data_fname.length > 0) {
            console.log("AND THE FILENAME (From CB) IS:", data_fname);
            emitter.emit('new-filename-retrieved-from-sqs', data_fname)
        }
        else{
            console.log('no more files to process Goodby.');
            return;
        }
    });
});

emitter.on('done-loading',function(fname){
    console.log('xxxxxxx',fname)
})


emitter.emit('start');

function loadFile(filename:string){
    TableLoaderModule.load(filename,emitter);
}

function processFile(filename) {
    let tablePreparer = new TablePreparerModule.TablePreparer(filename, 1);
    tablePreparer.prepareTables(function (data) {
        if (data == 'ready') {
            console.log('tables-are-ready', filename);
            emitter.emit('tables-are-prepared',filename)


        }
    });
}

//
//export class BdETL {
//    //FdicFileJobMaker = FdicFileJobMaker;
//    private _s3;
//    private _sqs;
//    private _dynamoDocClient; //http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/DynamoDB/DocumentClient.html
//    private _currentFileName = null;
//    private _emitter = new EventEmitter();
//
//
//    constructor() {
//        // this._s3 = new AWS.S3(config.s3Config);
//        // this._sqs = new AWS.SQS(config.sqsConfig);
//        // this._dynamoDocClient = new AWS.DynamoDB.DocumentClient(config.dynamodbConfig)
//    };
//
//
////USING ASYNC.JS TO SYNCHRONOUSLY PROCESS FILE
//    processFilesWhilst() {
//
//        //bring processFile method into scope
//        var processFile = this.processFile;
//        ///var getNextFile = getNextFile;
//        async.whilst(
//            //test (first argument of whilst async.whilst method)
//            function () {
//                let intervalGetNextRecord = setInterval(function () {
//
//
//                }, 3000);
//            },
//            //run this every time test is true
//            //(second method of async.whilst method)
//            function (cb)//cb(error)
//            {
//                processFile(fname, function (cb1) {
//                    if (cb1) {
//                        console.log('myLongfunction returns', cb1);
//                        cb(null, 'xx')
//                    }
//                    else {
//                        console.log('muLongfunction no joy', cb1);
//                        cb("got an error")
//                    }
//                })
//
//            },
//            //run this when test fails and/or repeated execution stops
//            //(third argument of async.whilst method)
//            function (err, n) {
//                console.log('err', err);
//                console.log('n', n)
//            }
//        )
//    }
//
//
//
//}

//var etl = new BdETL();
//etl.processFilesWhilst();
//JobMakerModule.JobMaker.getNextRecord(function(fname){
//    console.log("AND THE FILENAME (From CB) IS:", fname);
//});
