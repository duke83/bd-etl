/// <reference path="../typings/node.d.ts" />
'use strict';
var AWS = require('aws-sdk');
var QDateModule = require('./QDate');
var sqs = new AWS.SQS({ region: "us-east-1" });
var util = require('util.js');
class JobMaker {
    constructor(s3Proxy, sqsProxy) {
        var qd = new QDateModule.QDate(2012, 1);
        s3Proxy.listObjects({
            Bucket: 'fdic_stage_3',
            Prefix: 'All_Reports_' + qd.string
        }, function (err, data) {
            if (err) {
                console.log(err);
            }
            if (data) {
                for (let i = 0; i < data.Contents.length; i++) {
                    console.log(data.Contents[i].Key);
                    var recordCount = util.getRecordCount(data.Contents[i].Key);
                    sqs.sendMessage({
                        MessageBody: { filename: data.Contents[i].Key, recordCount = recordCount },
                        QueueUrl: 'https://sqs.us-east-1.amazonaws.com/859294003383/FDICFileJobs' //,
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
    ;
    make() {
        var qd = new QDateModule.QDate(2012, 1);
        //console.log(qd);
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
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
// INSTANTIATE A NEW JobMaker OBJECT
var maker = new JobMaker(s3);
// INVOKE THE make() ME///THOD
maker.make();
//# sourceMappingURL=job-maker.js.map