
function loadFdicRow_Numeric(tablename, varName, ddval, cert) {
    var itemParams = {
        TableName: tablename,
        Item: {
            varname: {S: varName},
            ddval: {N: ddval},
            cert: {N: cert}
        }
    };

    var dynamodb = ddbHelpers.getAwsDynamodb();
    dynamodb.putItem(itemParams, function (err, data) {
        if (err) {
            throw('loadFdicRow_Numeric', itemParams, err)
        }
        else {
            // successful response
            //return data;
            return;
        }
    });
}

function loadFdicRow_Alpha(tablename, varName, ddval, cert) {

    var itemParams = {
        TableName: tablename,
        Item: {
            varname: {S: varName},
            ddval: {S: ddval},
            cert: {N: cert}
        }
    };

    var dynamodb = ddbHelpers.getAwsDynamodb();
    dynamodb.putItem(itemParams, function (err, data) {
        if (err) {
            console.log('error in loadFdicRow_Alpha', itemParams, err);

            throw(itemParams, err);
        }
        else {
            // successful response
            //if (itemParams.Item.varname === 'docket') {
            //    throw('what they hey!? isnt docket numeric?', itemParams)
            //}
            ///return data;
            return;
        }
    });
}