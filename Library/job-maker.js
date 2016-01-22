/// <reference path="../typings/node.d.ts" />
'use strict';
var AWS = require('aws-sdk');
var sqs = new AWS.SQS({ region: "us-east-1" });
var util = require('./util.js');
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
var sqsUrl = 'https://sqs.us-east-1.amazonaws.com/859294003383/FDICFileJobs';
class JobMaker {
    constructor(s3Proxy, sqsProxy) {
    }
    static getNextRecord(cb) {
        var params = {
            "QueueUrl": sqsUrl,
            "MaxNumberOfMessages": 1,
            "VisibilityTimeout": 30,
            "WaitTimeSeconds": 20
        };
        sqs.receiveMessage(params, function (err, data) {
            console.log('recievemessage err', err);
            if (data) {
                var filename = data.Messages[0].Body;
                var handle = data.Messages[0].ReceiptHandle;
                sqs.deleteMessage({
                    "QueueUrl": sqsUrl,
                    "ReceiptHandle": handle
                }, function (err, data) {
                    console.log('deletemesage err', err);
                    console.log('deletemessage data', data);
                    cb(filename);
                    return filename;
                });
            }
            console.log('receivemessage data', data);
        });
    }
    static make(qd) {
        s3.listObjects({
            Bucket: 'fdic_stage_3',
            Prefix: 'All_Reports_' + qd.string
        }, function (err, data) {
            if (err) {
                console.log(err);
            }
            if (data) {
                for (let i = 0; i < data.Contents.length; i++) {
                    console.log(data.Contents[i].Key);
                    sqs.sendMessage({
                        MessageBody: data.Contents[i].Key,
                        QueueUrl: sqsUrl
                    }, function (err2, data2) {
                        if (err2) {
                            console.log(err2);
                        }
                        if (data2) {
                            console.log(data2);
                        }
                    });
                }
            }
        });
    }
}
exports.JobMaker = JobMaker;
//var sqsParams = {
//    MessageBody: data.Contents[i].Key,
//    QueueUrl:sqs.getQueueUrl({
//        QueueName: 'FDICFileJobs'
//})
//}
// THIS IS THE CLIENT PORTION
//JOB-MAKER REQUIRES PROXIES FOR S3 AND SQS
// INVOKE THE make() METHOD
//var qd = QDateModule.QDate.getFirstQuarterQdate();
//
//while (qd.string < '20151231') {
//    console.log(qd);
//    qd = qd.getNext();
//    //JobMaker.make(qd);
//}
//JobMaker.getNextRecord(function(fname){
//    console.log("AND THE FILENAME (From CB) IS:", fname);
//});
//console.log("\n AND THE FILENAME IS: ", JobMaker.getNextRecord()); 
//# sourceMappingURL=job-maker.js.map