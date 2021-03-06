/// <reference path="../typings/node.d.ts" />

/**
 * Created by Kent on 1/6/2016.
 */

var AWS = require('aws-sdk');
var s3 = new AWS.S3({s3ForcePathStyle: true});
var parse = require('csv-parse');
export function getRecordCount(filename,cb){
    var s3FilenameParams = {
        Bucket: 'fdic_stage_3',
        Key: filename
    };
    var startTime=Date.now();
    var parser = parse({delimiter: ','});
    parser.on('readable', function () {
        while (parser.read()) {}
    });
    parser.on('error', function (err) {
        console.log(err.message);
    });
    var readstream = s3.getObject(s3FilenameParams).createReadStream();
    readstream.on('readable', function () {
        parser.write(readstream.read());
    });


    readstream.on('end', function () {
        var endTime=Date.now();
        //console.log('total',(endTime-startTime)/1000);
        console.log('parser.count',parser.count);
        cb(parser.count)
    });

}

var testfile="All_Reports_19921231_- Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv"
//var test = getRecordCount(testfile)