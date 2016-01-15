/// <reference path="../typings/node.d.ts" />


var AWS = require('aws-sdk');
var DOC = require("dynamodb-doc");

var glossaryData = require('./fdicGlossaryData.js');
var environment = 'prod'; // anything but 'prod' is localx

export function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

export function getGlossaryItemByVarName(varname, val) {
    var lambda = new AWS.Lambda({region: 'us-east-1'});

    lambda.invoke({
        FunctionName: 'FdicGlossary',
        Payload: JSON.stringify({
            methodName: 'getItemByVarName',
            srchParam: varname
        }) // pass params
    }, function (error, data) {
        if (error) {
            console.log('there was an error in getGlossaryItemByVarName' + error)

        }
        if (data.Payload) {
        }
    });
//        for (var i = 0; i <= glossaryItems.length; i++) {
//            if (glossaryItems[i] && glossaryItems[i].VarName.toUpperCase() === varname.toUpperCase()) {
//                return glossaryItems[i];
//            }
//        }
//if varname is not in the glossary and a val was passed, try to discern AON from the val
    var aonDefault = 'alpha';
    if (typeof(val) != 'undefined') {
        aonDefault = isNumber(val) ? 'numeric' : 'alpha'
    }
    return {
        "V1": 0,
        "database": "missing",
        "VarName": varname,
        "ShortDescription": "missing",
        "LongDescription": "missing",
        "File": "missing",
        "AON": aonDefault
    };

}


export function getFdicDdbTableName(YYYYMMDD, aon) {

    if (aon == 'alpha') {
        var tblName_alpha = 'FDIC-' + YYYYMMDD.substring(0, 4) + '-' + YYYYMMDD.substring(4, 6) + '-' + YYYYMMDD.substring(6, 8) + '-ALPHA';
        return tblName_alpha;
    }
    if (aon == 'numeric') {
        var tblName_num = 'FDIC-' + YYYYMMDD.substring(0, 4) + '-' + YYYYMMDD.substring(4, 6) + '-' + YYYYMMDD.substring(6, 8) + '-NUM';
        return tblName_num;
    }
    throw('you must specify alpha or numeric for aon ');
}

export function tableExists(tableName) {
    var p1 = new Promise(
        function (resolve, reject) {
            var ddb = getAwsDynamodb();
            var params = {
                TableName: tableName
            };

            if (reject) {
                console.log('idunno');
            }

            ddb.describeTable(params, function (e, d) {
                if (d && d.Table) {
                    resolve(true);
                }
                else {
                    resolve(false);
                }
                //console.log(d)
            });

        }
    );
    return p1;
}


export function getAwsDynamodb(env) {
    //return local environment for anything except prod
    var environment = 'prod'//env ? env : this.environment;

    //console.log('getAwsDynamodb is using ', environment);
    if (environment === 'prod') {
        var awsClient = new AWS.DynamoDB({apiVersion: '2012-08-10', region: 'us-east-1'});
        return awsClient;
    }
    var awsClient = new AWS.DynamoDB({
        apiVersion: '2012-08-10',
        endpoint: new AWS.Endpoint("http://localhost:8000")
    });

    return awsClient;
}

export function getAwsDynamodbDocClient(env) {

    //this function is dependent on the environment variable in the parent scope
    //return local environment for anything except prod

    var environment = env ? env : environment;
    if (environment === 'prod') {
        var awsClient = new AWS.DynamoDB({apiVersion: '2012-08-10', region: 'us-east-1'});
        var docClient = new DOC.DynamoDB(awsClient);
        return docClient;
    }
    var awsClient = new AWS.DynamoDB({
        apiVersion: '2012-08-10',
        endpoint: new AWS.Endpoint("http://localhost:8000")
    });
    var docClient = new DOC.DynamoDB(awsClient);
    return docClient;
}

export function getQDateFromFilename(filename) {
//All_Reports_19921231_Unused Commitments.csv
    return filename.substr(12, 8)
}
