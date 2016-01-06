exports.s3Config = function s3config() {
    return {
        s3ForcePathStyle: true
    }
}

exports.sqsConfig = function () {
    return {
        region: 'us-east-1'
    }
}

exports.dynamodbConfig = function () {
    return {apiVersion: '2016-01-01', region: 'us-east-1'}
}
