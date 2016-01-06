/// <reference path="../typings/node.d.ts" />
'use strict';
var QDateModule = require('./QDate');
class JobMaker {
    constructor(s3Proxy, sqsProxy) {
    }
    ;
    make() {
        var qd = new QDateModule.QDate(2012, 1);
        console.log(qd);
        console.log('moo');
    }
}
exports.JobMaker = JobMaker;
// THIS IS THE CLIENT PORTION
//JOB-MAKER REQUIRES PROXIES FOR S3 AND SQS
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
// INSTANTIATE A NEW JobMaker OBJECT
var maker = new JobMaker(s3);
// INVOKE THE make() METHOD
maker.make();
//# sourceMappingURL=job-maker.js.map