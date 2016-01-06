/// <reference path="../typings/node.d.ts" />
'use strict';
var QDateModule = require('./QDate');
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
// THIS IS THE CLIENT PORTION
//JOB-MAKER REQUIRES PROXIES FOR S3 AND SQS
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
// INSTANTIATE A NEW JobMaker OBJECT
var maker = new JobMaker(s3);
// INVOKE THE make() ME///THOD
maker.make();
//# sourceMappingURL=job-maker.js.map