/// <reference path="../typings/node.d.ts" />
'use strict';
var QDateModule = require('./QDate');
var config = require("./config.js");
var AWS = require('aws-sdk');
var s3 = new AWS.S3({ s3ForcePathStyle: true });
var csv = require('csv/lib');
var dynamodb = new AWS.DynamoDB(config.dynamodbConfig());
//var docClient=new AWS.DynamoDB.DocumentClient(config.dynamodbConfig());
var docClient = new AWS.DynamoDB.DocumentClient(dynamodb);
//var etlState = require('./bnkrd-etl-state.js');
var async = require('async');
var EventEmitter = require('events');
var localEmitter = new EventEmitter();
var glossaryData = require('./fdicGlossaryData.js');
var filename;
var callerEmitter;
var tablename_alpha;
var tablename_numeric;
var arrPutItemsParams = []; //create an array for a flat process to iterate
var arrErrors = [];
function load(filename, callerEmitterParam) {
    if (callerEmitterParam) {
        callerEmitter = callerEmitterParam;
    }
    else {
        callerEmitter = {
            emit: function () {
                console.log('fake callerEmitter');
            }
        };
    }
    var qdate = QDateModule.QDate.getQDateFromFileName(filename);
    tablename_alpha = qdate.tablename_alpha;
    tablename_numeric = qdate.tablename_numeric;
    //console.log('tables: ', tablename_alpha, tablename_numeric);
    localEmitter.emit('start', filename);
}
exports.load = load;
var IntervalMaster = setInterval(function () {
    var thisDate = new Date();
    console.log('intervalMaster - arrPutItemsParams.length', arrPutItemsParams.length, thisDate);
    if (arrPutItemsParams.length == 0) {
        console.log('there were some errors', arrErrors.length, arrErrors);
        clearInterval(IntervalMaster);
    }
}, 10000);
localEmitter.on('start', function (fname) {
    //console.log('xxxxx', csv.transform)
    //var x = s3.getObject(fname);
    var s3FilenameParams = {
        Bucket: 'fdic_stage_3',
        Key: fname
    };
    //var file = require('fs').createWriteStream('/Users/kdm/bd-etl/library/'+fname);
    //s3.getObject(s3FilenameParams).createReadStream().pipe(file);
    s3.getObject(s3FilenameParams).createReadStream()
        .pipe(csv.parse())
        .pipe(csv.transform(function (record) {
        var row = {
            rownumber: record[0],
            VarName_cert: record[1],
            repdte: record[2],
            Value: record[3],
            VarName: getVarName(record[4]),
            cert: record[5]
        };
        //console.log('row', row);
        localEmitter.emit('row-parsed-from-s3-file', row);
    }));
    setTimeout(function () {
        console.log('ROW ITERATION IS COMPLET. arrPutItemsParams has', arrPutItemsParams.length);
        localEmitter.emit('ready-to-get-next-from-array');
    }, 50);
});
localEmitter.on('row-parsed-from-s3-file', function (row) {
    var glossaryItem = getGlossaryItemByVarName(row.VarName, row.Value);
    var val = row.Value;
    if (glossaryItem.AON == 'numeric' && !isNumber(row.Value)) {
        val = '-9';
    }
    if (glossaryItem.AON == 'alpha' && row.Value == '') {
        val = 'ddEmpty';
    }
    pushToItemsArray(glossaryItem.AON == 'numeric' ? tablename_numeric : tablename_alpha, row.VarName, val, row.cert);
});
function getVarName(vname) {
    if (vname === 'name') {
        return 'bankName';
    }
    return vname;
}
function getGlossaryItemByVarName(varname, val) {
    var gItem = extractGlossaryItem(varname);
    if (gItem) {
        return gItem;
    }
    //if varname is not in the glossary and a val was passed, try to discern AON from the val
    var aonDefault = 'alpha';
    if (typeof (val) != 'undefined') {
        aonDefault = isNumber(val) ? 'numeric' : 'alpha';
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
function isNumber(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}
var rowCount_successful = 0;
var rowCount_fail = 0;
function pushToItemsArray(tablename, varName, ddval, cert) {
    var arrTableNameParts = tablename.split("-");
    var tableSuffix = arrTableNameParts[arrTableNameParts.length - 1];
    var ddvalObj = tableSuffix == "ALPHA" ? { S: ddval } : { N: ddval };
    var itemParams = {
        TableName: tablename,
        Item: {
            varname: { S: varName },
            ddval: ddvalObj,
            cert: { N: cert }
        }
    };
    //console.log('loadFdicRow itemParams', itemParams);
    arrPutItemsParams.push(itemParams);
}
function extractGlossaryItem(varname) {
    var glossaryItems = [
        {
            "V1": 624,
            "database": "fdic-sdi-data",
            "VarName": "ABCUBK",
            "ShortDescription": "Unused Commitments to Provide Liquidity to Conduit Structures",
            "LongDescription": "Conduits Sponsored by the BankUnused Commitments to Provide Liquidity to Conduit Structures: Asset-Backed Commercial Paper Conduits Sponsored By The Bank,A Bank Affiliate, Or The Bank's Holding Company.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 625,
            "database": "fdic-sdi-data",
            "VarName": "ABCUOTH",
            "ShortDescription": "Unused Commitments to Provide Liquidity, Unrelated Institutions",
            "LongDescription": "Conduits Sponsored by Other Unrelated InstitutionsUnused Commitments To Provide Liquidity To ConduitStructures:  Asset-Backed Commercial Paper Conduits Sponsored By Other Unrelated Institutions.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 622,
            "database": "fdic-sdi-data",
            "VarName": "ABCXBK",
            "ShortDescription": "Asset-Backed Commercial Paper Conduits Sponsored by the Bank",
            "LongDescription": "Conduits Sponsored by the BankMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided To Conduit Structures In The Form Of Standby Letters Of Credit, Subordinate Securities, And OtherEnhancements - Assets-Backed Commercial Paper ConduitsSponsored By The Bank, A Bank Affiliate Or The Bank's Holding Company.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 623,
            "database": "fdic-sdi-data",
            "VarName": "ABCXOTH",
            "ShortDescription": "Asset-Backed Commercial Paper Conduits Sponsored by Other Unrelated Inst.",
            "LongDescription": "Conduits Sponsored by Other Unrelated InstitutionsMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided To Conduit Structures In The Form Of Standby Letters Of Credit, Subordinate Securities, And OtherEnhancements - Assets-Backed Commercial Paper ConduitsSponsored By Other Unrelated Institutions.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 613,
            "database": "fdic-sdi-data",
            "VarName": "ASCEAUTO",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales Auto Loans",
            "LongDescription": "Auto LoansMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - Auto Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 615,
            "database": "fdic-sdi-data",
            "VarName": "ASCECI",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales C&I Loans",
            "LongDescription": "Commercial & Industrial LoansMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - Commercial And Industrial Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 614,
            "database": "fdic-sdi-data",
            "VarName": "ASCECONS",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales Other Consumer Loans",
            "LongDescription": "Other Consumer LoansMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - Other Consumer Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 612,
            "database": "fdic-sdi-data",
            "VarName": "ASCECRCD",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - Credit Cards Receivables.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 611,
            "database": "fdic-sdi-data",
            "VarName": "ASCEHEL",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales Home Equity Lines",
            "LongDescription": "Home Equity LinesMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - Home Equity Lines.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 616,
            "database": "fdic-sdi-data",
            "VarName": "ASCEOTH",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales All Other Loans & All Leases",
            "LongDescription": "All Other Loans and All LeasesMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - All Other Loans, Other Assets and Leases.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 610,
            "database": "fdic-sdi-data",
            "VarName": "ASCERES",
            "ShortDescription": "Maximum Amount of Credit Exposure, Bank Asset Sales 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential LoansMaximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancement For Assets That Were Sold And Not Securitized - 1-4 Family Residential Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 208,
            "database": "fdic-sdi-data",
            "VarName": "ASDRAUTO",
            "ShortDescription": "Assets Sold With Recourse Auto Loans",
            "LongDescription": "Auto LoansAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 210,
            "database": "fdic-sdi-data",
            "VarName": "ASDRCI",
            "ShortDescription": "Assets Sold With Recourse C&I Loans",
            "LongDescription": "Commercial & Industrial LoansAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - Commercial And Industrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 209,
            "database": "fdic-sdi-data",
            "VarName": "ASDRCONS",
            "ShortDescription": "Assets Sold With Recourse Other Consumer Loans",
            "LongDescription": "Other Consumer LoansAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - Other Consumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 207,
            "database": "fdic-sdi-data",
            "VarName": "ASDRCRCD",
            "ShortDescription": "Assets Sold With Recourse Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - Credit Cards Receivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 206,
            "database": "fdic-sdi-data",
            "VarName": "ASDRHEL",
            "ShortDescription": "Assets Sold With Recourse Home Equity Lines",
            "LongDescription": "Home Equity LinesAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - Home Equity Lines.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 211,
            "database": "fdic-sdi-data",
            "VarName": "ASDROTH",
            "ShortDescription": "Assets Sold With Recourse All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All LeasesAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - All Other Loans, Other Assets and Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 205,
            "database": "fdic-sdi-data",
            "VarName": "ASDRRES",
            "ShortDescription": "Assets Sold With Recourse 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential LoansAssets Sold With Recourse Or Other Seller-Provided CreditEnhancements And Not Securitized - 1-4 Family Residential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 118,
            "database": "fdic-sdi-data",
            "VarName": "asset",
            "ShortDescription": "Total assets",
            "LongDescription": "The sum of all assets owned by the institution including cash, loans, securities, bank premises and other assets. This total does not include off-balance-sheet accounts.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 154,
            "database": "fdic-sdi-data",
            "VarName": "asset2",
            "ShortDescription": "Average assets, quarterly",
            "LongDescription": "The two period average of the total assets shown on the balance sheet.  The calculation uses this quarter's and last quarter's values. An example calculation for September would be (June assets + September assets) / 2. The denominator for quarterly income as a percent of average assets.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 153,
            "database": "fdic-sdi-data",
            "VarName": "asset5",
            "ShortDescription": "Average total assets",
            "LongDescription": "Year-to-date average of the total assets represented on the balance sheet. Used as the denominator for year-to-date income as a percent of average assets. The number of quarterly values used in the calculation depends on the date of the data. year-to-date averages: march reporting period - (december assets + march assets) / 2 june reporting period - (december assets + march assets + june assets) / 3 September reporting period - (December assets + March assets + June assets + September assets) / 4 December reporting period - (Previous December assets + March assets + June assets + September assets + December assets) / 5 Quarterly averages: All reporting periods ñ (Previous quarter assets + current quarter assets) / 2",
            "File": "Assets and Liabilities.csv; Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 936,
            "database": "fdic-sdi-data",
            "VarName": "assetfor",
            "ShortDescription": "Total assets in foreign offices",
            "LongDescription": "The sum of all assets held in foreign offices owned by the institution including cash, loans, securities, bank premises and other assets.  This total does not include off-balance-sheet accounts.  Available for Call Reporters only.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 152,
            "database": "fdic-sdi-data",
            "VarName": "asstlt",
            "ShortDescription": "Long-term assets (5+ years)",
            "LongDescription": "Loans and debt securities with remaining maturities or repricing intervals of over five years.   This item is not available for TFR Reporters.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 847,
            "database": "fdic-sdi-data",
            "VarName": "astempm",
            "ShortDescription": "Assets per employee ($millions)",
            "LongDescription": "Total assets in millions of dollars as a percent of the number of full-time equivalent employees.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 156,
            "database": "fdic-sdi-data",
            "VarName": "AVASSETJ",
            "ShortDescription": "Adjusted average assets for leverage capital purposes",
            "LongDescription": "Average assets-adjusted is based on the risk-based capital definitions for prompt corrective action (PCA) and includes: call reporters: average assets (from schedule rc-k) - disallowed intangible assets - unrealized loss on equity securities - unrealized holding gains or losses on available-for-sale securities according to FASB 115 - adjustments for financial subsidiaries (Beginning in March 2001) Thrift Financial Reporters: Adjusted tangible assets (from schedule CCR) - unrealized holding gains or losses on available-for-sale securities adjusted according to FASB 115",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 323,
            "database": "fdic-sdi-data",
            "VarName": "bkclass",
            "ShortDescription": "Bank Charter Class",
            "LongDescription": "A classification code assigned by the FDIC based on the institution's charter type (commercial bank or savings institution), charter agent (state or federal), Federal Reserve membership status (Fed member, Fed nonmember)and its primary federal regulator (state chartered institutions are subject to both federal and state supervision). n = commercial bank, national (federal) charter and fed member, supervised by the office of the comptroller of the currency (occ) sm = commercial or savings bank, state charter and fed member, supervised by the federal reserve (frb) nm = commercial bank, state charter and fed nonmember, supervised by the FDIC or OCC SB = savings banks, state charter, supervised by the FDIC SA = As of July 21, 2011, FDIC supervised state chartered thrifts and OCC supervised federally chartered thrifts. Prior to that date, state or federally chartered savings associations supervised by the Office of Thrift Supervision (OTS). OI = insured U.S. branch of a foreign chartered institution (IBA)",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 126,
            "database": "fdic-sdi-data",
            "VarName": "bkprem",
            "ShortDescription": "Bank premises and fixed assets",
            "LongDescription": "Bank premises, furniture and fixtures, equipment and other assets representing bank premises (including capitalized leases) owned by the institution.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 994,
            "database": "fdic-sdi-data",
            "VarName": "bro",
            "ShortDescription": "Brokered deposits",
            "LongDescription": "Total brokered deposits held in domestic offices. Brokered deposits represent funds which the reporting bank obtains, directly orindirectly, by or through any deposit broker for deposit into one or more deposit accounts. Thus, brokered deposits include both those in which the entire beneficial interest in a given bank deposit account or instrument is held by a single depositor and those in which the deposit broker sells participations in a given bank deposit account or instrument to one or more investors.Fully insured brokered deposits are brokered deposits that are issued in denominations of $100,000",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 995,
            "database": "fdic-sdi-data",
            "VarName": "broins",
            "ShortDescription": "Fully insured brokered deposits",
            "LongDescription": "Brokered deposits held in domestic offices issued in denominations of less than $100,000, or in denominations of $100,000 or more and participated out by the broker in shares of less than $100,000note: although standard fdic insurance coverage was temporarily raised from $100,000 to $250,000 in october 2008, institutions are required to report this item based on the $100,000 coverage limit through December 2009.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 930,
            "database": "fdic-sdi-data",
            "VarName": "cd1t3",
            "ShortDescription": "Time deposits of $100,000 or more: 1 to 3 years",
            "LongDescription": "Domestic time deposits of $100,000 or more that are either fixed rate instruments with remaining maturities of one through three years or floating rate instruments subject to repricing less often than yearly, but more often than once every three years. This item is not available for TFR Reporters.",
            "File": "Time Deposits of $100,000 or More.csv",
            "AON": "numeric"
        },
        {
            "V1": 934,
            "database": "fdic-sdi-data",
            "VarName": "cd1t3s",
            "ShortDescription": "Time deposits of < $100,000: 1 - 3 years",
            "LongDescription": "Domestic time deposits of less than $100,000, plus all open-account time deposits that are either fixed rate instruments with remaining maturities of one through three years or floating rate instruments subject to repricing less often than yearly, but more often than once every three years.  This item is not available for TFR Reporters.",
            "File": "Time Deposits of Less Than $100,000.csv",
            "AON": "numeric"
        },
        {
            "V1": 928,
            "database": "fdic-sdi-data",
            "VarName": "cd3les",
            "ShortDescription": "Time deposits of $100,000 or more:3 months or less",
            "LongDescription": "Domestic time deposits of $100,000 or more that are either fixed rate instruments with remaining maturities of 3 months or less or floating rate instruments subject to repricing on a quarterly or more frequent basis.  This item is not available for TFR Reporters.",
            "File": "Time Deposits of $100,000 or More.csv",
            "AON": "numeric"
        },
        {
            "V1": 932,
            "database": "fdic-sdi-data",
            "VarName": "cd3less",
            "ShortDescription": "Time deposits of < $100,000: 3 months or less",
            "LongDescription": "Domestic time deposits of less than $100,000, plus all open-account time deposits that are either fixed rate instruments with remaining maturities of 3 months or less or floating rate instruments subject to repricing on a quarterly or more frequent basis.   This item is not available for TFR Reporters.",
            "File": "Time Deposits of Less Than $100,000.csv",
            "AON": "numeric"
        },
        {
            "V1": 929,
            "database": "fdic-sdi-data",
            "VarName": "cd3t12",
            "ShortDescription": "Time deposits of $100,000 or more: 3 to 12 months",
            "LongDescription": "Domestic time deposits of $100,000 or more that are either fixed rate instruments with remaining maturities of more than 3 months, but less than one year or floating rate instruments subject to repricing less often than quarterly, but more often than yearly. This item is not available for TFR Reporters.",
            "File": "Time Deposits of $100,000 or More.csv",
            "AON": "numeric"
        },
        {
            "V1": 933,
            "database": "fdic-sdi-data",
            "VarName": "cd3t12s",
            "ShortDescription": "Time deposits of < $100,000: 3 - 12  months",
            "LongDescription": "Domestic time deposits of less than $100,000, plus all open-account time deposits that are either fixed rate instruments with remaining maturities of more than 3 months, but less than one year or floating rate instruments subject to repricing less often than quarterly, but more often than yearly.   This item is not available for TFR Reporters.",
            "File": "Time Deposits of Less Than $100,000.csv",
            "AON": "numeric"
        },
        {
            "V1": 931,
            "database": "fdic-sdi-data",
            "VarName": "cdov3",
            "ShortDescription": "Time deposits of $100,000 or more: 3 or more years",
            "LongDescription": "Domestic time deposits of $100,000 or more that are either fixed rate instruments with remaining maturities of more than 3 years or floating rate instruments subject to repricing every three years or more.   This item is not available for TFR Reporters.",
            "File": "Time Deposits of $100,000 or More.csv",
            "AON": "numeric"
        },
        {
            "V1": 935,
            "database": "fdic-sdi-data",
            "VarName": "cdov3s",
            "ShortDescription": "Time deposits of < $100,000: 3 or more years",
            "LongDescription": "Domestic time deposits of less than $100,000, plus all open-account time deposits that are either fixed rate instruments with remaining maturities of more than 3 years or floating rate instruments subject to repricing every three years or more.   This item is not available for TFR Reporters.",
            "File": "Time Deposits of Less Than $100,000.csv",
            "AON": "numeric"
        },
        {
            "V1": 306,
            "database": "fdic-sdi-data",
            "VarName": "cert",
            "ShortDescription": "FDIC Certificate #",
            "LongDescription": "A unique NUMBER assigned by the FDIC used to identify institutions and for the issuance of insurance certificates.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 119,
            "database": "fdic-sdi-data",
            "VarName": "chbal",
            "ShortDescription": "Cash & Balances due from depository institutions",
            "LongDescription": "Total cash and balances due from depository institutions including both interest-bearing and noninterest-bearing balances.",
            "File": "Assets and Liabilities.csv; Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 937,
            "database": "fdic-sdi-data",
            "VarName": "chbalfor",
            "ShortDescription": "Cash and due from depository institutions",
            "LongDescription": "Total cash and balances due from depository institutions held in foreign offices, including both interest-bearing and noninterest-bearing balances.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 120,
            "database": "fdic-sdi-data",
            "VarName": "chbali",
            "ShortDescription": "Interest-bearing balances",
            "LongDescription": "Savings or time balances, including certificates of deposit, that are due from other depository institutions. Does not include certificates of deposit held in trading accounts.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 267,
            "database": "fdic-sdi-data",
            "VarName": "chbalni",
            "ShortDescription": "Total noninterest-bearing balances",
            "LongDescription": "The total noninterest-bearing cash (currency and coin) and balances due from depository institutions.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 259,
            "database": "fdic-sdi-data",
            "VarName": "chcic",
            "ShortDescription": "Cash items in process of collection",
            "LongDescription": "Cash items in process of collection, including unposted debits and currency and coin.  Beginning in 2001, this item is not reported by FFIEC Call filers with less than $300 million in  total assets. Prior to 2001, this item also includes balances due from federal reserve banks for filers with total assets of less than $100 million.  It also includes noninterest-earning deposits for TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 261,
            "database": "fdic-sdi-data",
            "VarName": "chcoin",
            "ShortDescription": "Currency and coin in domestic offices",
            "LongDescription": "Currency and coin held in domestic offices.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 266,
            "database": "fdic-sdi-data",
            "VarName": "chfrb",
            "ShortDescription": "Balances due from FRB",
            "LongDescription": "The total cash balances due from Federal Reserve Banks as shown by the reporting bank's books.  This amount includes reserves and other balances. Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million. Prior to 2001, this item was reported in the 'Cash and balances due' categories for FFIEC Call Report filers with total assets of less than $100 million.   This item is not filed by TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 260,
            "database": "fdic-sdi-data",
            "VarName": "chitem",
            "ShortDescription": "Collection in domestic offices",
            "LongDescription": "Cash items in the process of collection and unposted debits (held in domestic offices) which are immediately payable upon presentation.  Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million. Prior to 2001, this item also includes balances due from federal reserve banks for filers with total assets of less than $100 million.   This item is not filed by TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 264,
            "database": "fdic-sdi-data",
            "VarName": "chnus",
            "ShortDescription": "Balances due from foreign banks",
            "LongDescription": "Cash balances due from banks in foreign countries and foreign central banks. Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million.    This item is not filed by TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 265,
            "database": "fdic-sdi-data",
            "VarName": "chnusfbk",
            "ShortDescription": "Foreign branches of U.S. banks",
            "LongDescription": "Cash balances due from foreign branches of other U.S. banks. Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million.    This item is not filed by TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 262,
            "database": "fdic-sdi-data",
            "VarName": "chus",
            "ShortDescription": "Balances due from depository institutions in U.S.",
            "LongDescription": "Cash balances due from depository institutions in U.S. include all interest-bearing and noninterest-bearing balances whether in the form of demand, savings or time balances, including certificates of deposit but excluding certificates of deposit held for trading. Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 263,
            "database": "fdic-sdi-data",
            "VarName": "chusfbk",
            "ShortDescription": "U.S. branches of foreign banks",
            "LongDescription": "Cash balances due from U.S. branches and agencies of foreign banks (including their International Banking Facilities) which is comprised of all interest-bearing and noninterest-bearing balances whether in the form of demand, savings or time balances, including certificates of deposit not held for trading. Beginning in 2001, this item is not reported by FFIEC Call filers with total assets of less than $300 million.    This item is not filed by TFR Reporters.",
            "File": "Cash and Balances Due.csv",
            "AON": "numeric"
        },
        {
            "V1": 308,
            "database": "fdic-sdi-data",
            "VarName": "citystatezip",
            "ShortDescription": "City, State, Zip",
            "LongDescription": "City-- City in which an institution's headquarters is physically located. State -- State in which an institution's headquarters is physically located. County -- The name of the county where the institution is physically located. ZIP -- The first five digits of the full postal zip code representing physical location of the institution.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 302,
            "database": "fdic-sdi-data",
            "VarName": "ConCusRpt",
            "ShortDescription": "View Custom Report Selections",
            "LongDescription": "The 'View Custom Report Selections/View Custom Report Selections for Download' screen displays if: data items were selected when creating a custom report you selected a report to download from the confirmation page Review and confirm the data items that were selected in the  creation of the custom report or by selecting a report  to download from the confirmation page.  Then press: \t\t\t  Add More - to select additional data items \t Next - to confirm the selections and create the custom report or continue with the download",
            "File": "Corporate Trust and Agency Accounts.csv; Download Selection Criteria Confirmation.csv",
            "AON": "alpha"
        },
        {
            "V1": 303,
            "database": "fdic-sdi-data",
            "VarName": "ConRpt",
            "ShortDescription": "Confirmation Reports",
            "LongDescription": "The Confirmation Report verifies the SDI database to ensure that the column selections are valid.  Invalid selections will be displayed on this report. For example, if a custom peer group is created for a given report date and then the report date is changed, the confirmation process determines whether all of the peers are valid for the modified report date. Any group that is not valid will be highlighted and will be accompanied by a message stating that the invalid peers are not available for the reporting period.   From the Confirmation Report, the user can:  Modify Report Dates \t Modify  how income is calculated  \t\t year-to-date basis \t\t\t quarterly basis \t\t \t \t Make a report selection and \t\t View \t\t Download \t\t  \t Review column selections      Selecting 'Download' from the confirmation page creates a comma separated value (.CSV) file consisting solely of selected data items. Each data item from any of the SDI's  twenty-four reports can be selected.  (Note:  this download feature is based on the user's column selections and can return a maximum of two hundred records. Larger downloads can be accomplished by selecting the 'SDI Map, Definitions, and Data Download' tab from the main SDI menu.    To download from the confirmation page:",
            "File": "Custom Report Selection.csv",
            "AON": "alpha"
        },
        {
            "V1": 991,
            "database": "fdic-sdi-data",
            "VarName": "coredep",
            "ShortDescription": "Retail deposits",
            "LongDescription": "The core deposit definition was changed in March 2011.<br> Core deposits held in domestic offices now includes:total domestic office deposits minus<br>(1) time deposits of more than $250,000 held indomestic offices <br>(2) brokered deposits of $250,000 or less held indomestic offices.<br><br>Prior to the March 2010, core deposits were calculated as follows:<br> Total domestic office deposits minus <br>(1) time deposits of $100,000 or moreheld in domestic offices.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 315,
            "database": "fdic-sdi-data",
            "VarName": "county",
            "ShortDescription": "County",
            "LongDescription": "County where the institution is physically located (abbreviated if the county name exceeds 16 characters).",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 499,
            "database": "fdic-sdi-data",
            "VarName": "crag",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Total recoveries of loans to finance agricultural production and other loans to farmers that have been credited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 508,
            "database": "fdic-sdi-data",
            "VarName": "cragsm",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Total recoveries of loans to finance agricultural production and other loans to farmers that have been credited to the allowance for loan and lease losses established by the institution.  This item is reported only by institutions with assets of $300 million or less.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 503,
            "database": "fdic-sdi-data",
            "VarName": "CRAUTO",
            "ShortDescription": "Auto Loans - Recoveries",
            "LongDescription": "Recoveries of loans to individuals for household, family and other personal expenditures:automobile loans credited to the allowance for loan and lease losses. Quarterly Variable: CRAUTOQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "alpha"
        },
        {
            "V1": 500,
            "database": "fdic-sdi-data",
            "VarName": "crci",
            "ShortDescription": "Commercial and industrial loans",
            "LongDescription": "Total recoveries of commercial and industrial loans that have been credited to the allowance for loan and lease losses established by the institution.  Note: For banks with assets of less than $300 million, this item includes all other loans (loans to depository institutions, agricultural loans, etc.).",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 501,
            "database": "fdic-sdi-data",
            "VarName": "crcon",
            "ShortDescription": "Loans to individuals",
            "LongDescription": "Total recoveries of loans to individuals for household, family, and other personal expenditures that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 504,
            "database": "fdic-sdi-data",
            "VarName": "CRCONOTH",
            "ShortDescription": "Other Consumer Loan Recoveries",
            "LongDescription": "Recoveries of loans to individuals for household, family, and other personal expenditures: all other loans credited to the allowance for loan and lease losses.  Note: Beginning March 2011, excludes automobile loans. Beginning March 2001, includes recoveries of revolving credit plans other than credit cards. Quarterly Variable: CRCONOTQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 502,
            "database": "fdic-sdi-data",
            "VarName": "crcrcd",
            "ShortDescription": "Credit card loan recoveries",
            "LongDescription": "Total recoveries of credit cards and related plans to individuals for household, family, and other personal expenditures that have been credited to the allowance for loan and lease losses established by the institution. note: 1) prior to march 2001, included recoveries of related revolving credit plans other than credit cards.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 497,
            "database": "fdic-sdi-data",
            "VarName": "crdep",
            "ShortDescription": "Loans to depository institutions",
            "LongDescription": "Total recoveries of loans to depository institutions and acceptances of other banks that have been credited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 498,
            "database": "fdic-sdi-data",
            "VarName": "crdepnus",
            "ShortDescription": "To foreign banks",
            "LongDescription": "Total recoveries of loans to foreign depository institutions and acceptances of other banks that have been credited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 505,
            "database": "fdic-sdi-data",
            "VarName": "crforgv",
            "ShortDescription": "Loans to foreign governments and official institutions",
            "LongDescription": "Total recoveries of loans to foreign governments and official institutions that have been credited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 487,
            "database": "fdic-sdi-data",
            "VarName": "crlnls",
            "ShortDescription": "Total recoveries",
            "LongDescription": "The total amount of recoveries of loans and lease financing receivables credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 507,
            "database": "fdic-sdi-data",
            "VarName": "crls",
            "ShortDescription": "Lease financing receivables",
            "LongDescription": "Total recoveries of lease financing receivables that have been credited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 506,
            "database": "fdic-sdi-data",
            "VarName": "crother",
            "ShortDescription": "Other loans",
            "LongDescription": "Recoveries of all other loans that have been credited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 488,
            "database": "fdic-sdi-data",
            "VarName": "crre",
            "ShortDescription": "Loans secured by real estate, total",
            "LongDescription": "The total amount of recoveries of loans secured by real estate credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 492,
            "database": "fdic-sdi-data",
            "VarName": "crreag",
            "ShortDescription": "Secured by farmland",
            "LongDescription": "Total recoveries of loans secured by farmland (which are held in domestic offices) that have been charged-off and credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 491,
            "database": "fdic-sdi-data",
            "VarName": "crrecons",
            "ShortDescription": "Construction and land development",
            "LongDescription": "Total recoveries of real estate loans (which are held in domestic offices) for construction and land development purposes that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 496,
            "database": "fdic-sdi-data",
            "VarName": "crrefor",
            "ShortDescription": "Real estate loans in foreign offices",
            "LongDescription": "The total amount of charged-off loans secured by real estate and held in foreign offices of the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 1034,
            "database": "fdic-sdi-data",
            "VarName": "crreloc",
            "ShortDescription": "Home equity lines of credit - total recoveries",
            "LongDescription": "Total recoveries of revolving open-end loans secured by 1-4 family residential properties and extended under lines of credit (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Total Recoveries 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 494,
            "database": "fdic-sdi-data",
            "VarName": "crremult",
            "ShortDescription": "Secured by multifamily residential properties",
            "LongDescription": "Total recoveries of multifamily (5 or more) residential properties (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 495,
            "database": "fdic-sdi-data",
            "VarName": "crrenres",
            "ShortDescription": "Secured by nonfarm nonresidential properties",
            "LongDescription": "Total recoveries of nonfarm nonresidential properties (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 489,
            "database": "fdic-sdi-data",
            "VarName": "crrenus",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "The total amount of recoveries of loans secured by real estate (whose addresses are not within the U.S.) credited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 493,
            "database": "fdic-sdi-data",
            "VarName": "crreres",
            "ShortDescription": "Secured by 1-4 family residential properties - total recoveries",
            "LongDescription": "Total recoveries of loans secured by 1-4 family residential properties (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv; Total Recoveries 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 1033,
            "database": "fdic-sdi-data",
            "VarName": "CRRERSF2",
            "ShortDescription": "Loans secured by 1-4 family junior liens ñ total recoveries",
            "LongDescription": "Total recoveries of closed-end loans secured by junior liens 1-4 family residential properties (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.<P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Total Recoveries 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 1032,
            "database": "fdic-sdi-data",
            "VarName": "CRRERSFM",
            "ShortDescription": "Loans secured by 1-4 family senior liens ñ total recoveries",
            "LongDescription": "Total recoveries of closed-end loans secured by first liens 1-4 family residential properties (which are held in domestic offices) that have been credited to the allowance for loan and lease losses established by the institution.<P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Total Recoveries 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 361,
            "database": "fdic-sdi-data",
            "VarName": "ctderben",
            "ShortDescription": "Bank is beneficiary",
            "LongDescription": "Notional amount of credit derivatives on which the reporting institution has obtained a guarantee against credit losses from other parties.  Credit derivatives are off-balance sheet arrangements that allow one party (the beneficiary) to transfer the credit risk of an asset to another party (the guarantor).",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 360,
            "database": "fdic-sdi-data",
            "VarName": "ctdergty",
            "ShortDescription": "Bank is guarantor",
            "LongDescription": "Notional amount of credit derivatives on which the institution has extended credit protection to another party.  Credit derivatives are off-balance sheet arrangements that allow one party (the beneficiary) to transfer the credit risk of an asset to another party (the guarantor).",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 300,
            "database": "fdic-sdi-data",
            "VarName": "CusPG",
            "ShortDescription": "Custom Peer Groups",
            "LongDescription": "Custom Peer Group - create custom groups of FDIC-insured institutions, \t\t\tbank holding companies, or combinations of both (up to 50 institutions) \t\t\tand then retrieve financial reports on the groups created. There are three \t\t\tprimary methods for creating a custom peer group:  \t\t If known, enter the \t\t\t\t \t\t\t\tFDIC Certificate numbers by selecting 'Enter IDs manually.' Use the FDIC \t\t\t\tCertificate numbers in the appropriate area on the data form. (Note: all \t\t\t\tFDIC-insured institutions have an assigned Certificate number.)  \t\t\t If known, enter the  \t\t\t\t \t\t\t\tOTS Docket number by selecting 'Enter IDs manually.'  Use the OTS Docket \t\t\t\tnumbers in the appropriate area on the data form. (Note: Only those financial \t\t\t\tinstitutions that are regulated by the Office of Thrift Supervision have an \t\t\t\tassigned OTS Docket number.  \t\t\t Select 'Create a Peer Group' and use the 'Find' feature to select the \t\t\t\tinstitutions or bank holding companies to be included in the custom peer group. \t\t\t\tThe 'Find' feature allows one or more criteria to be entered when locating \t\t\t\tFDIC-insured institutions. {mention about the add more feature? Please see \t\t\t\thelp Selections for column n.} \t  \t\t  \tAdditionally, custom peer groups can be saved and then retrieved for later use. \tPlease see the help on  \tPeer Groups for more details. If a group containing more \tthan 50 entities is requested, check to see if a Standard Peer Group is available.",
            "File": "Custom Peer Group.csv",
            "AON": "alpha"
        },
        {
            "V1": 301,
            "database": "fdic-sdi-data",
            "VarName": "CusRptSel",
            "ShortDescription": "Custom Report Selections",
            "LongDescription": "Selecting the 'Custom Reports' choice from the Report Selection drop-down menu creates a report consisting solely of selected data items. Each data item from any of the twenty-four reports within the SDI system can be selected.  To create a custom report:",
            "File": "Custom Report Selection.csv",
            "AON": "alpha"
        },
        {
            "V1": 984,
            "database": "fdic-sdi-data",
            "VarName": "ddt",
            "ShortDescription": "Demand deposits",
            "LongDescription": "Total demand deposits included in transaction accounts held in domestic offices. prior to 2004, this item is not available for TFR Reporters.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 132,
            "database": "fdic-sdi-data",
            "VarName": "dep",
            "ShortDescription": "Total deposits",
            "LongDescription": "The sum of all deposits including demand deposits, money market deposits, other savings deposits, time deposits and deposits in foreign offices.",
            "File": "Assets and Liabilities.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 855,
            "database": "fdic-sdi-data",
            "VarName": "DEPDASTR",
            "ShortDescription": "Total domestic deposits to total assets",
            "LongDescription": "Total domestic office deposits as a percent of total assets.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 134,
            "database": "fdic-sdi-data",
            "VarName": "depdom",
            "ShortDescription": "Deposits held in domestic offices",
            "LongDescription": "The sum of all domestic office deposits, including demand deposits, money market deposits, other savings deposits and time deposits.",
            "File": "Assets and Liabilities.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 356,
            "database": "fdic-sdi-data",
            "VarName": "depfbkf",
            "ShortDescription": "Banks in foreign countries",
            "LongDescription": "Deposits of foreign banks (including U.S. branches and agencies of foreign banks) held in foreign offices.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 357,
            "database": "fdic-sdi-data",
            "VarName": "depfgovf",
            "ShortDescription": "Foreign governments and official institutions",
            "LongDescription": "Deposits of foreign governments and official institutions (including foreign central banks) held in foreign offices.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 353,
            "database": "fdic-sdi-data",
            "VarName": "depfor",
            "ShortDescription": "Deposits held in foreign offices",
            "LongDescription": "The sum of all foreign office deposits, including demand deposits, money market deposits, other savings deposits and time deposits.  *&nbsp;&nbsp;This item is not available for TFR Reporters.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 133,
            "database": "fdic-sdi-data",
            "VarName": "depi",
            "ShortDescription": "Interest-bearing deposits",
            "LongDescription": "Interest-bearing deposits (includes interest-bearing deposits in foreign offices).",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 990,
            "database": "fdic-sdi-data",
            "VarName": "depidom",
            "ShortDescription": "Interest-bearing deposits",
            "LongDescription": "The sum of interest-bearing time and savings deposits held in domestic offices.  This item is not available for Thrift Financial Report filers having both assets less than $300 million and risk-based capital ratios if 12 percent or more.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 956,
            "database": "fdic-sdi-data",
            "VarName": "depifor",
            "ShortDescription": "Interest-bearing deposits",
            "LongDescription": "The sum of interest-bearing time and savings deposits held in foreign offices.   This item is not available for TFR Reporters.",
            "File": "Small Business Loans.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 992,
            "database": "fdic-sdi-data",
            "VarName": "depins",
            "ShortDescription": "Estimated insured deposits",
            "LongDescription": "The estimated amount of FDIC insured deposits in domestic offices and in insured branches of Puerto Rico and US territories and possessions. notes: (1) as of july 21, 2010, the standard maximum deposit insurance amount was permanently raised to $250,000. (2) Beginning December 31, 2010, through December 31, 2012, includes the unlimited insurance coverage of noninterest-bearing transaction accounts. all noninterest-bearing transaction accounts are fully insured, regardless of the balance of the account, at all FDIC-insured institutions. (3) Beginning September 2009, amounts for non-retirement accounts are reported based on the temporary increase to the standard insurance limit to $250,000. (4) Prior to September 2009, amounts for non-retirement accounts were reported based on the standard insurance limit of $100,000. (5) Beginning in 2006, retirement accounts are insured to $250,000 and reporting was phased in at different times during the year by banks, thrifts and IBAs. (6) Prior to March 2002, reported for domestic offices only. (7) This calculation uses the self-reported estimate of uninsured deposits filed by institutions that are greater than $1 billion.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 354,
            "database": "fdic-sdi-data",
            "VarName": "depipccf",
            "ShortDescription": "Individuals, partnerships and corporations",
            "LongDescription": "Total transaction and nontransaction accounts of individuals, partnerships and corporations (including all certified and official checks) held in foreign offices.  This item is not available for TFR reporters with assets less than $300 million and risk-based capital ratios in excess of 12 percent.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 339,
            "database": "fdic-sdi-data",
            "VarName": "deplgb",
            "ShortDescription": "Number (#) of deposit accounts more then $100,000",
            "LongDescription": "Number of individual deposit accounts of more than $100,000 held in domestic offices and insured U.S. branches of a foreign chartered institutions (IBAs). As of March 1991, this item is reported on a quarterly basis and is listed as memoranda only. beginning june 2006, excludes retirement accounts for call reporters and beginning september 2006, excludes retirement accounts for ibas.",
            "File": "Deposits Based on the $100,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 348,
            "database": "fdic-sdi-data",
            "VarName": "DEPLGRA",
            "ShortDescription": "Amount ($) of retirement deposit accounts of more than $250,000",
            "LongDescription": "The total amount of retirement deposit accounts (demand, savings, and time) of more than $250,000 held in domestic offices and insured branches in US territories.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 349,
            "database": "fdic-sdi-data",
            "VarName": "DEPLGRN",
            "ShortDescription": "Number (#) of retirement deposit accounts of more than $250,000",
            "LongDescription": "The total number of retirement deposit accounts (demand, savings, and time) with a balance on the report date of more than $250,000 held in domestic offices and insured branches in US territories.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 336,
            "database": "fdic-sdi-data",
            "VarName": "depsmb",
            "ShortDescription": "Number (#) of deposit accounts of $ 100,000 or less (June only for Call)",
            "LongDescription": "Number of deposit accounts of $ 100,000 or less held in domestic offices. This is listed as a memoranda only. beginning september 2009, institutions are required to report most deposits on the $250,000 threshold levels. Beginning June 2006, excludes retirement accounts for Call Reporters. Call Reporters provide this item only on the June Call report. TFR Reporters provide this item each quarter.",
            "File": "Deposits Based on the $100,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 343,
            "database": "fdic-sdi-data",
            "VarName": "DEPSMRA",
            "ShortDescription": "Amount ($) of retirement deposit accounts of $250,000 or less",
            "LongDescription": "The balance of all retirement deposit accounts (demand, savings, and time) with a balance of $250,000 or less held in domestic offices and insured branches in US territories.<br><br>Notice: Insured deposit amounts or deposit thresholds reflect permanent insurance limits in effect as of the report date, not withstanding temporary increases currently in effect.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 344,
            "database": "fdic-sdi-data",
            "VarName": "DEPSMRN",
            "ShortDescription": "Number (#) of retirement deposit accounts of $250,000 or less",
            "LongDescription": "Total number of retirement deposit accounts (demand, savings, and time) with a balance on the report date of $250,000 or less, held in domestic offices and in insured branches in US territories. important note: for call reporters and iba filers, this item is reported only on the june call report.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 355,
            "database": "fdic-sdi-data",
            "VarName": "depusbkf",
            "ShortDescription": "Commercial banks and other depository institutions in U.S.",
            "LongDescription": "Deposits of U.S. banks (including IBFs and foreign branches of U.S. banks) and other depository institutions in the U.S that are held in foreign offices.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 338,
            "database": "fdic-sdi-data",
            "VarName": "deplgamt",
            "ShortDescription": "Amount ($) deposit accounts of more than $100,000",
            "LongDescription": "Amount of deposit accounts of more than $100,000 held in domestic offices and in insured branches in Puerto Rico and U.S. territories and possessions note: 1.) Beginning september 2009, institutions are required to report most deposits on the $250,000 threshold levels. 2.)beginning june 2006, excludes retirement accounts for Call Reporters. 3.) Beginning September 2006, excludes retirement accounts for Insured U.S. Branches of a foreign chartered institutions (IBAs). 4.) Beginning December 2006, excludes retirement accounts for TFR Reporters.",
            "File": "Deposits Based on the $100,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 996,
            "database": "fdic-sdi-data",
            "VarName": "DEPLSNB",
            "ShortDescription": "Deposits obtained via list services, yet not brokered",
            "LongDescription": "Estimated amount of deposits obtained through the use of deposit listing services that are not brokered.<br><br> Available as of March 2011",
            "File": "Total Deposits.csv",
            "AON": "alpha"
        },
        {
            "V1": 989,
            "database": "fdic-sdi-data",
            "VarName": "depnidom",
            "ShortDescription": "Noninterest-bearing deposits",
            "LongDescription": "The sum of total demand deposits and noninterest-bearing time and savings deposits held in domestic offices. <P>Prior to 2004, this item is not available for <a href='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'>TFR Reporters</a>.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 955,
            "database": "fdic-sdi-data",
            "VarName": "depnifor",
            "ShortDescription": "Noninterest-bearing deposits",
            "LongDescription": "The sum of total demand deposits and noninterest-bearing time and savings deposits held in foreign offices.   This item is not available for TFR Reporters.",
            "File": "Small Business Loans.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 335,
            "database": "fdic-sdi-data",
            "VarName": "depsmamt",
            "ShortDescription": "Amount ($) Deposit accounts of $100,000 or less",
            "LongDescription": "Amount of deposit accounts of $100,000 or less held in domestic offices and in insured branches in Puerto Rico and U.S. territories and possessions beginning september 2009, institutions are required to report most deposits on the $250,000 threshold levels. beginning june 2006, excludes retirement accounts for Call Reporters. Beginning September 2006, excludes retirement accounts for Insured U.S. branches of a foreign chartered institutions (IBA). Beginning December 2006, excludes retirement accounts for TFR Reporters.",
            "File": "Deposits Based on the $100,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 358,
            "database": "fdic-sdi-data",
            "VarName": "depusmf",
            "ShortDescription": "U.S government, states, and political subdivisions",
            "LongDescription": "Deposits of U.S. government, states and political subdivisions in the U.S. that are held in foreign offices.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv; Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 1079,
            "database": "fdic-sdi-data",
            "VarName": "DLSel_Con",
            "ShortDescription": "Download Selections",
            "LongDescription": "Selecting 'Download' from the confirmation page creates a comma separated value (.CSV) file consisting solely of selected data items. Each data item from any of the SDI's  twenty-four reports can be selected.  (Note:  this download feature is based on the user's column selections and can return a maximum of two hundred records. Larger downloads can be accomplished by selecting the  'SDI Map, Definitions, and Data Download' tab from the main SDI menu.    To download from the confirmation page:",
            "File": "View Custom Report Selections.csv",
            "AON": "alpha"
        },
        {
            "V1": 378,
            "database": "fdic-sdi-data",
            "VarName": "Downconf",
            "ShortDescription": "Download Selection Criteria Confirmation",
            "LongDescription": "Download Selection Criteria Confirmation   Review and confirm the criteria used for the download.     From this page: \t \t view the number of institutions to be included in the report and the size of the file to be downloaded. \t review the selection criteria used for the download file \t proceed by pressing the : \t\t \t\t &quot;Download&quot; button to obtain the file \t\t &quot;Change Criteria&quot; button to modify selection criteria \t\t &quot;Start Over&quot; button to reset and reinitiate the entire download process \t\t  \t \t\t  Continue by pressing the &quot;Download&quot; button. Remember to save the file with a .CSV extension and press &quot;OK&quot; to proceed. Do not press OK repeatedly as it will slow the processing of information.  Choose to save the file to disk and then press &quot;OK&quot; again.  Enter the following: \t \t directory and path in which to save the file \t name for the downloaded file (Reminder: The file must have a .CSV extension in order to be readable). \t   Press &quot;Save&quot;",
            "File": "Download Selection Criteria Confirmation.csv",
            "AON": "alpha"
        },
        {
            "V1": 1080,
            "database": "fdic-sdi-data",
            "VarName": "Downsel",
            "ShortDescription": "Download Selections",
            "LongDescription": "Download Selections  &quot;Download&quot; any data item from SDI.  Any of the SDI's data items included in its twenty-four reports can be downloaded as a comma separated variable file (.CSV). Choose from nineteen distinct search boxes to generate lists of FDIC-insured institutions for the download file. Files of sizes up to 2.5 megabytes can be downloaded. It is recommended that users file a Freedom of Information Act (FOIA) (note: hyperlink to FDIC FOIA) request to obtain information that is too large to download. (Note: this download feature is independent of the column selections used to create reports in SDI and the download capability that exists within the column selection scenario).    To download from the top menu bar:   \t Select &quot;SDI Map, Definitions, and Data Download&quot;. \t Select the &quot;Data Download&quot; button and press &quot;Next&quot;. \t Select the report that contains the requisite data item.   Choose from the following reports:   \t Assets and liabilities  \t\t \t\t Cash and balances due \t\t Securities \t\t Net loans and leases \t\t\t \t\t\t Loans to depository institutions \t\t\t Net loans and leases in foreign offices\t\t\t \t\t\t Maturity and repricing for loans and                  leases      \t\t\t \t\t\t  \t\t Other real estate owned \t\t Total deposits \t\t\t \t\t\t Total deposits of less than $100,000 \t\t\t Total deposits of $100,000 or more     \t \t\t\t  \t Total unused commitments \t\t\t \t\t\t Letters of credit \t\t\t Financial assets transferred   \t\t\t \t \t Total assets in foreign offices \t Off-balance-sheet derivatives \t Past due and nonaccrual assets     \t   Income and expense \t\t \t\t Total interest income \t\t Total interest expense \t\t Loan charge-offs \t\t Foreign office income and expense \t\t Changes in equity capital    \t\t   Performance and condition ratios   \t\t    After the report has been selected, &quot;check&quot; the requisite item(s)  Repeat steps 1 and 2 as necessary.  Press &quot;Next&quot; after all items have been selected.\t\t  A confirmation page will appear. Press:  \t \t Add More - to select additional data items \t Next - to confirm the selections and create the          custom report           \t   A page titled &quot;Download Selection      Criteria&quot; will appear. One or more criteria can be entered to locate      and download financial reports for FDIC-insured institutions. The download      file is based on the information entered as the selection criteria. The      selection criteria is divided into two categories:                                               Basic \t \t Institution Name - the entire name, or part of the name, of a specific institution may be entered to produce an Institution List of available selections.\t \t City - the city in which the financial institution's headquarters are physically located. Either the entire city name or part of the name may be entered to produce a list of choices.\t \t State - the state in which the financial institutions' headquarters are physically located. The FDIC Act defines State as any &quot;State of the United States, the District of Columbia, and any territory of the United States, Puerto Rico, Guam, American Samoa, the Trust Territory of the Pacific Islands, the Virgin Island, and the Northern Mariana Islands.&quot;\t  \t\tSelect multiple states for download by constantly holding the CTRL key while making selections.\t \t Status - an institution's status is based on the most recent demographic information, Status selections are:  \t\t \t\t Active -- Institutions that are currently open and insured by the FDIC  \t\t Inactive -- Institutions that are currently closed but were once insured by the FDIC  \t\t All -- Both active and inactive institutions \t\t  \t Sort by - the order in which the list of institutions will be sorted.   The default sort order of an Institution List is based on institution name. If an alternative sort order is desired, select one from the drop-down box. Available sort choices are: {Compress - Expand}\t \t\t \t\t Bank Name \t\t City, State \t\t FDIC Certificate Number \t\t Inactive Date \t\t Institution Class \t\t Established Date \t\t Net Income (qtr) \t\t Net Income (ytd) \t\t QBP Commercial Bank Region \t\t State, City \t\t Total Assets \t\t Total Deposits \t\t  \t\t  \t Information as of - The financial information date selected from the drop-down box will generate data for the period ending on that date\t \t   Advanced \t \t Specialized Categories (FAQ) - frequently asked questions which include: \t\t \t\t Top 100 Banks and thrifts by Assets \t\t Agricultural Banks \t\t Banks Headquartered in US with Foreign Offices \t\t Banks Directly Owned by Another Bank \t\t Credit Card Institutions \t\t Federally Chartered Institutions \t\t Institutions with Interstate Branches \t\t Mutual (Non Stock) Institutions \t\t &quot;Oakar&quot; Institutions \t\t &quot;Sasser&quot; Institutions \t\t State Chartered Institutions \t\t Stock Held Savings Institutions \t\t Subchapter S Corporations \t\t  \t Established (After Date/Before Date) - The date on which the institution began operations. \t Inactive Date (After Date/before Date) - The date that the institution, once insured by the FDIC, was closed. \t Size or Performance (Greater than/Less than) - Size criteria (assets or deposits) or net income (year-to-date or quarter) may be selected from a drop-down box. A dollar amount (in millions) must also be entered in one of the two size selection boxes. Criteria will default to the minimum and maximum values if no size criteria are entered. \t Charter Type - the legal authorization to conduct business granted to a financial institution by federal or state government. \t\t \t\t All Charters \t\t Insured Commercial Banks \t\t Insured Savings Institutions \t\t Insured Branches of Foreign Banks \t\t  \t Chartering Agency - the agency or jurisdiction responsible for issuing a charter to a FDIC-insured depository institution. \t\t \t\t All Chartering Agencies - State and Federal \t\t Comptroller of the Currency - Chartering authority for nationally (federally) chartered commercial banks \t\t Office of Thrift Supervision - Chartering authority for federally chartered savings associations \t\t State (includes U.S. Territories) - Chartering authority for institutions that are not chartered by the OCC or OTS \t\t  \t Federal Regulator - the agency primarily responsible for regulating a FDIC-insured depository institution. \t\t \t\t All Federal Regulators \t\t Federal Deposit Insurance Corporation \t\t Federal Reserve Board \t\t Comptroller of the Currency \t\t Office of Thrift Supervision \t\t  \t Insurance Fund - fund to which FDIC-insured depository institutions primarily belong. \t\t \t\t Both BIF and SAIF \t\t Bank Insurance Fund (BIF)- Institutions that are primary members of the Bank Insurance Fund \t\t Savings Association Insurance Fund (SAIF) - Institutions that are primary members of the Savings Association Insurance Fund \t\t  \t Quarterly Banking Profile Region - The Quarterly Banking Profile (QBP) Commercial Bank Region in which the institution is physically located. Select from a drop down box. Click here (note: hyperlink to QBP Region breakdown) for regional breakdown. \t  \tNote: Group data by QBP Region is only available for Insured Commercial Banks and Insured Savings Institutions and NOT for All Insured Institutions, Insured Commercial Banks by asset size and Insured Savings Institutions by asset size.\t \t FDIC Field Office - The FDIC Field Office where the institution is physically located. \t     After all selection criteria has been entered the user must press &quot;Find.&quot;  A Download Selection Criteria Confirmation screen will appear. From this screen: \t \t view the number of institutions to be included in the report and the size of the file to be downloaded. \t review the selection criteria used for the download file \t proceed by pressing the : \t\t \t\t &quot;Download&quot; button to obtain the file \t\t &quot;Change Criteria&quot; button to modify selection criteria \t\t &quot;Start Over&quot; button to reset and reinitiate the entire download process \t\t  \t   Continue by pressing the &quot;Download&quot; button. Remember to save the file with a .CSV extension and press &quot;OK&quot; to proceed. Do not press OK multiple times as it will slow the processing of information.  Choose to save the file to disk and then press &quot;OK&quot; again.  Enter the following: \t \t directory and path in which to save the file \t name for the downloaded file (Reminder: The file must have a .CSV extension in order to be readable). \t   Press &quot;Save&quot;.",
            "File": "View Custom Report Selections.csv",
            "AON": "alpha"
        },
        {
            "V1": 477,
            "database": "fdic-sdi-data",
            "VarName": "drag",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 486,
            "database": "fdic-sdi-data",
            "VarName": "dragsm",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is reported only by institutions with assets of $300 million or less.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 481,
            "database": "fdic-sdi-data",
            "VarName": "DRAUTO",
            "ShortDescription": "Auto Loans Charge-Offs",
            "LongDescription": "Charged-off loans to individuals for household, family, and other personal expenditures:  Automobile loans debited to the allowance for loan and lease losses. Quarterly variable: DRAUTOQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "alpha"
        },
        {
            "V1": 478,
            "database": "fdic-sdi-data",
            "VarName": "drci",
            "ShortDescription": "Commercial and industrial loans",
            "LongDescription": "Total commercial and industrial loans that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  Note: For banks with assets of less than $300 million, this item includes all other loans (loans to depository institutions, agricultural loans, etc.).",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 479,
            "database": "fdic-sdi-data",
            "VarName": "drcon",
            "ShortDescription": "Loans to individuals",
            "LongDescription": "Total loans to individuals for household, family, and other personal expenditures that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 482,
            "database": "fdic-sdi-data",
            "VarName": "DRCONOTH",
            "ShortDescription": "Other Consumer Loan Charge-Offs",
            "LongDescription": "Charged-off loans to individuals for household, family, and other personal expenditures: all other loans debited to the allowance for loan and lease losses.  Note: Prior to March  2011, excludes automobile loans.  Beginning March 2001, includes revolving creditplans other than credit cards. Quarterly Variable: DRCONOTQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 480,
            "database": "fdic-sdi-data",
            "VarName": "drcrcd",
            "ShortDescription": "Credit card loan charge offs",
            "LongDescription": "Total credit cards and related plans to individuals for household, family, and other personal expenditures that have been charged-off and debited to the allowance for loan and lease losses established by the institution. note: 1) prior to march 2001, included charge-offs of related revolving credit plans other than credit cards.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 475,
            "database": "fdic-sdi-data",
            "VarName": "drdep",
            "ShortDescription": "Loans to depository institutions",
            "LongDescription": "Total loans to depository institutions and acceptances of other banks that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 476,
            "database": "fdic-sdi-data",
            "VarName": "drdepnus",
            "ShortDescription": "To foreign banks",
            "LongDescription": "Total loans to foreign depository institutions and acceptances of other banks that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 483,
            "database": "fdic-sdi-data",
            "VarName": "drforgv",
            "ShortDescription": "Loans to foreign governments and official institutions",
            "LongDescription": "Total loans to foreign governments and official institutions that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 465,
            "database": "fdic-sdi-data",
            "VarName": "drlnls",
            "ShortDescription": "Total charge-offs",
            "LongDescription": "The total amount of charged-off loans and lease financing receivables debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 485,
            "database": "fdic-sdi-data",
            "VarName": "drls",
            "ShortDescription": "Lease financing receivables",
            "LongDescription": "Total lease financing receivables that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 484,
            "database": "fdic-sdi-data",
            "VarName": "drother",
            "ShortDescription": "Other loans",
            "LongDescription": "All other loans that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 466,
            "database": "fdic-sdi-data",
            "VarName": "drre",
            "ShortDescription": "Loans secured by real estate, total",
            "LongDescription": "The total amount of charged-off loans secured by real estate debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 470,
            "database": "fdic-sdi-data",
            "VarName": "drreag",
            "ShortDescription": "Secured by farmland",
            "LongDescription": "Total loans secured by farmland (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 469,
            "database": "fdic-sdi-data",
            "VarName": "drrecons",
            "ShortDescription": "Construction and land development",
            "LongDescription": "Total real estate loans (which are held in domestic offices) for construction and land development purposes that have charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 474,
            "database": "fdic-sdi-data",
            "VarName": "drrefor",
            "ShortDescription": "Real estate loans in foreign offices",
            "LongDescription": "The total amount of charged-off loans secured by real estate and held in foreign offices of the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 961,
            "database": "fdic-sdi-data",
            "VarName": "drreloc",
            "ShortDescription": "Total charge offs - home equity lines of credit",
            "LongDescription": "Total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Total Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 472,
            "database": "fdic-sdi-data",
            "VarName": "drremult",
            "ShortDescription": "Secured by multifamily residential properties",
            "LongDescription": "Total multifamily (5 or more) residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 473,
            "database": "fdic-sdi-data",
            "VarName": "drrenres",
            "ShortDescription": "Secured by nonfarm nonresidential properties",
            "LongDescription": "Total nonfarm nonresidential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 467,
            "database": "fdic-sdi-data",
            "VarName": "drrenus",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "The total amount of charged-off loans secured by real estate (whose addresses are not within the U.S.) debited to the allowance for loan and lease losses established by the institution. This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 471,
            "database": "fdic-sdi-data",
            "VarName": "drreres",
            "ShortDescription": "Total charge-offs secured by 1-4 family residential properties",
            "LongDescription": "Total loans secured by 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Income and Expense.csv; Total Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 960,
            "database": "fdic-sdi-data",
            "VarName": "DRRERSF2",
            "ShortDescription": "Loans secured by 1-4 family junior liens ñ total charge-offs",
            "LongDescription": "Closed-end loans secured by junior liens 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.<P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Total Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 959,
            "database": "fdic-sdi-data",
            "VarName": "DRRERSFM",
            "ShortDescription": "Loans secured by 1-4 family senior liens ñ total charge-offs",
            "LongDescription": "Closed-end loans secured by first liens 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.<P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Total Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 58,
            "database": "fdic-sdi-data",
            "VarName": "EAMINTAN",
            "ShortDescription": "Goodwill impairment losses and amortization expense",
            "LongDescription": "Goodwill impairment losses and amortization expense and impairment loss for other intangible assets on a consolidated basis",
            "File": "Additional Noninterest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 373,
            "database": "fdic-sdi-data",
            "VarName": "edcm",
            "ShortDescription": "Contracts on other commodities and equities.",
            "LongDescription": "National amount of total equity derivative contracts, commodity contracts and other contracts. Not available for TFR Reporters.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 1019,
            "database": "fdic-sdi-data",
            "VarName": "edepdom",
            "ShortDescription": "Interest expense: Domestic office deposits",
            "LongDescription": "Total interest expense on deposits held in domestic offices.",
            "File": "Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 457,
            "database": "fdic-sdi-data",
            "VarName": "EDEPFOR",
            "ShortDescription": "Interest expense: Foreign office deposits",
            "LongDescription": "Total interest expense on deposits held in foreign offices, Edge and agreement subsidiaries and IBFs.",
            "File": "Interest income and expense in foreign offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 1020,
            "database": "fdic-sdi-data",
            "VarName": "edepfor",
            "ShortDescription": "Interest expense: Foreign office deposits",
            "LongDescription": "Total interest expense on deposits held in foreign offices, Edge and agreement subsidiaries and IBFs.",
            "File": "Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 846,
            "database": "fdic-sdi-data",
            "VarName": "eeffr",
            "ShortDescription": "Efficiency ratio",
            "LongDescription": "Noninterest expense, less the amortization expense of intangible assets, as a percent of the sum of net interest income and noninterest income.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 320,
            "database": "fdic-sdi-data",
            "VarName": "effdate",
            "ShortDescription": "Last Structure Change Effective Date",
            "LongDescription": "Effective Start Date of the data contained in this row.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 1021,
            "database": "fdic-sdi-data",
            "VarName": "efrepp",
            "ShortDescription": "Interest expense: Federal funds purchased",
            "LongDescription": "Total interest expense on federal funds purchased and securities sold under agreements to repurchase in domestic offices of the bank and of its Edge and agreement subsidiaries, and in IBFs.",
            "File": "Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 437,
            "database": "fdic-sdi-data",
            "VarName": "eintexp",
            "ShortDescription": "Total interest expense",
            "LongDescription": "Total interest expense",
            "File": "Goodwill and Other Intangibles.csv; Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 60,
            "database": "fdic-sdi-data",
            "VarName": "EINTGW",
            "ShortDescription": "Goodwill impairment losses",
            "LongDescription": "Goodwill impairment losses. This item is not available for TFR Reporters.",
            "File": "Additional Noninterest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 59,
            "database": "fdic-sdi-data",
            "VarName": "EINTOTH",
            "ShortDescription": "Amortization expense and impairment losses for other intangible losses",
            "LongDescription": "Amortization expense and impairment losses for other intangible assets. This item is not available for TFR Reporters.",
            "File": "Additional Noninterest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 844,
            "database": "fdic-sdi-data",
            "VarName": "elnantr",
            "ShortDescription": "Credit loss provision to net charge-offs",
            "LongDescription": "Provision for possible credit and allocated transfer risk as a percent of net charge-offs. If the denominator is less than or equal to zero, then ratio is shown as 'NA.'",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 439,
            "database": "fdic-sdi-data",
            "VarName": "elnatr",
            "ShortDescription": "Provision for loan and lease losses",
            "LongDescription": "The amount needed to make the allowance for loan and lease losses adequate to absorb expected loan and lease losses (based upon management's evaluation of the bank's current loan and lease portfolio). call reporters: prior to 2001 and after 2002, an allowance for transfer risk is also included to cover losses on international assets. Additionally, from 1997 to 2000, includes provision for credit losses on off-balance sheet credit exposures. TFR Reporters: Reflects net provision for losses on interest-bearing assets.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 838,
            "database": "fdic-sdi-data",
            "VarName": "ELNATRY",
            "ShortDescription": "Loan and lease loss provision to assets",
            "LongDescription": "The annualized provision for loans and lease losses as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a> on a consolidated basis.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 606,
            "database": "fdic-sdi-data",
            "VarName": "ENCEAUTO",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements Auto Loans",
            "LongDescription": "Auto LoansMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, And Other Enhancements - Auto Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 608,
            "database": "fdic-sdi-data",
            "VarName": "ENCECI",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements C&I Loans",
            "LongDescription": "Commercial & Industrial LoansMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, And Other Enhancements - Commercial And Industrial Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 607,
            "database": "fdic-sdi-data",
            "VarName": "ENCECON",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements Other Consumer Loans",
            "LongDescription": "Other Consumer LoansMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, And Other Enhancements - Other Consumer Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 605,
            "database": "fdic-sdi-data",
            "VarName": "ENCECRCD",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, And Other Enhancements - Credit Card Receivables.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 604,
            "database": "fdic-sdi-data",
            "VarName": "ENCEHEL",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements Home Equity Lines",
            "LongDescription": "Home Equity LinesMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, AndOther Enhancements - Home Equity Lines.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 609,
            "database": "fdic-sdi-data",
            "VarName": "ENCEOTH",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements All Other Lns. &  All Ls.",
            "LongDescription": "All Other Loans and All LeasesMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, And Other Enhancements - All Other Loans, Other Assets and Leases.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 603,
            "database": "fdic-sdi-data",
            "VarName": "ENCERES",
            "ShortDescription": "Maximum Amount of Credit Exposure, Credit Enhancements 1-4 Family Residential Ln",
            "LongDescription": "1-4 Family Residential LoansMaximum Amount Of Credit Exposure Arising From CreditEnhancements Provided By The Reporting Bank To OtherStandby Letters Of Credit, Purchase Subordinated Securities, AndOther Enhancements - 1-4 Family Residential Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 61,
            "database": "fdic-sdi-data",
            "VarName": "eothnint",
            "ShortDescription": "All other noninterest expense",
            "LongDescription": "All other noninterest expense on a consolidated basis. may include: data processing expenses, Advertising and marketing expenses, Directorsí fees, Printing, stationery, and supplies, Postage, Legal fees and expenses, FDIC deposit insurance assessments, Accounting and auditing expenses, Consulting and advisory expenses, Automated teller machine (ATM) and interchange expenses, and Telecommunications expenses. For Call Reporters prior to March 2001, it includes the amortization of intangible assets. It does not include losses on asset sales for TFR Reporters. beginning in June 1996;such gains (losses) are included net in noninterest income.",
            "File": "Additional Noninterest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 446,
            "database": "fdic-sdi-data",
            "VarName": "epremagg",
            "ShortDescription": "Premises and equipment expense",
            "LongDescription": "Expenses of bank premises and fixed assets, net of rental income. Excludes salaries and employee benefits and mortgage interest.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 142,
            "database": "fdic-sdi-data",
            "VarName": "eq",
            "ShortDescription": "Bank equity capital",
            "LongDescription": "Total bank equity capital (includes preferred and common stock, surplus and undivided profits).",
            "File": "Assets and Liabilities.csv; Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 861,
            "database": "fdic-sdi-data",
            "VarName": "eq5",
            "ShortDescription": "Average equity",
            "LongDescription": "The average of total equity capital (includes preferred and common stock, surplus and undivided profits). Averages are calculated as follows: Year-to-date averages: March reporting period - (December equity + March equity) / 2 June reporting period - (December equity + March equity + June equity) / 3 September reporting period - (December equity + March equity + June equity + September equity) / 4 December reporting period - (Previous December equity + March equity + June equity + September equity + December equity) / 5 Quarterly averages: All reporting periods ñ (Previous quarter equity + current quarter equity) / 2",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 278,
            "database": "fdic-sdi-data",
            "VarName": "eqcbhctr",
            "ShortDescription": "Other transactions with parent holding company",
            "LongDescription": "Other transactions involving the institution's parent holding company which affect equity capital directly such as capital contributions other than those for stock or dividends to the holding company in the form of property rather than cash.  Institutions with total assets of  less than $100 million file these data only on the December Call Report.  <p>Prior to 2004, this item is not available for TFR reporters.</p>",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 277,
            "database": "fdic-sdi-data",
            "VarName": "eqccompi",
            "ShortDescription": "Other comprehensive income",
            "LongDescription": "Other comprehensive income The bankís other comprehensive income for the calendar year-to-date. Other comprehensive income includes: The change during the calendar year-to-date in net unrealized holding gains (losses) on the bankís available-for-sale securities. The change during the calendar year-to-date in the bankís accumulated net gains (losses) on cash flow hedges. On the FFIEC 031 only, the increase or decrease during the calendar year-to-date in the bankís cumulative foreign currency translation adjustments and qualifying foreign currency transaction gains and losses, net of applicable income taxes, if any. The change during the calendar year-to-date in any minimum pension liability adjustment recognized in accordance with FASB Statement No. 87, Employersí Accounting for Pensions. Prior to 2004, this item is not available for TFR Reporters",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 268,
            "database": "fdic-sdi-data",
            "VarName": "eqcdiv",
            "ShortDescription": "Cash dividends",
            "LongDescription": "Cash dividends paid on common and preferred stock.",
            "File": "Cash and Balances Due.csv; Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 270,
            "database": "fdic-sdi-data",
            "VarName": "eqcdivc",
            "ShortDescription": "Cash dividends declared on common stock",
            "LongDescription": "Cash dividends declared on common stock during the calendar year-to-date.  Prior to 2001, institutions with total assets of less than $100 million file these data only on the December Call Report.",
            "File": "Cash Dividends.csv; Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 269,
            "database": "fdic-sdi-data",
            "VarName": "eqcdivp",
            "ShortDescription": "Cash dividends declared on preferred stock",
            "LongDescription": "Cash dividends declared on preferred stock during the calendar year-to-date.  Prior to 2001, institutions with total assets of  less than $100 million file these data only on the December Call Report.",
            "File": "Cash Dividends.csv; Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 276,
            "database": "fdic-sdi-data",
            "VarName": "eqcmrg",
            "ShortDescription": "Changes incidental to business combinations, net",
            "LongDescription": "Changes that occur as a result of pooling of interest, purchase acquisition, or push down accounting.  Institutions with total assets of  less than $100 million file these data only on the December Call Report.  This item is not available for TFR reporters.",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 147,
            "database": "fdic-sdi-data",
            "VarName": "eqconsub",
            "ShortDescription": "Equity, minor interest in consolidated subs",
            "LongDescription": "Non-controlling (minority) interests in consolidated subsidiaries, equity capital component. note: 1) beginning March 2009, total equity includes the non-controlling (minority) interests in consolidated subsidiaries for CALL report and TFR filers.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 271,
            "database": "fdic-sdi-data",
            "VarName": "eqcprev",
            "ShortDescription": "Amended balance at previous year-end",
            "LongDescription": "Amended bank equity capital beginning balance of the institution at previous calendar year-end.  Institutions with total assets of less than $100 million file these data only on the December Call Report.",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 272,
            "database": "fdic-sdi-data",
            "VarName": "eqcrest",
            "ShortDescription": "Restatements from amended reports of income, net",
            "LongDescription": "The sum of all corrections, net of applicable income taxes, resulting from material accounting errors which were made in prior years' Reports of Condition and Income and not corrected by the filing of an amended report for the period in which the error was made. Also includes the cumulative effect, net of applicable income taxes, of those changes in accounting principles adopted during the calendar year-to-date reporting period that were applied retroactively and for which prior years' financial statements were restated. prior to 2004, this item is not available for tfr reporters.",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 144,
            "database": "fdic-sdi-data",
            "VarName": "eqcs",
            "ShortDescription": "Common stock",
            "LongDescription": "Common stock issued by the institution.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 274,
            "database": "fdic-sdi-data",
            "VarName": "eqcstkrx",
            "ShortDescription": "Sale, conversion, retirement of capital stock, net",
            "LongDescription": "Sale, conversion, acquisition, or retirement of capital stock, net.  Included are the sale of the institution's perpetual preferred stock or common stock; exercise of stock options, conversion of convertible debt, limited life preferred stock, or perpetual preferred stock into common stock or perpetual preferred; redemption and retirement of perpetual preferred stock or common stock; treasury stock transactions; and capital related transactions involving the institution's employee stock ownership plan.  Institutions with total assets of less than $100 million file these data only on the December Call Report.",
            "File": "Changes in Bank Equity Capital.csv; Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 275,
            "database": "fdic-sdi-data",
            "VarName": "eqctrstx",
            "ShortDescription": "Net treasury stock transactions",
            "LongDescription": "The net treasury stock transaction on a consolidated basis. The change in the bankís total equity capital during the calendar year to date from the acquisition (without retirement) and resale or other disposal of the bank's own perpetual preferred stock or common stock, i.e., treasury stock transactions.",
            "File": "Changes in Bank Equity Capital.csv",
            "AON": "numeric"
        },
        {
            "V1": 143,
            "database": "fdic-sdi-data",
            "VarName": "eqpp",
            "ShortDescription": "Perpetual preferred stock",
            "LongDescription": "Perpetual preferred stock is preferred stock that does not have a stated maturity date or that cannot be redeemed at the option of the holder. It includes those issues of preferred stock that automatically convert into common stock at a stated date.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 145,
            "database": "fdic-sdi-data",
            "VarName": "eqsur",
            "ShortDescription": "Surplus",
            "LongDescription": "That portion of an institution's capital received for shares of stock sold in excess of par value (excludes all surplus related to preferred stock).",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 141,
            "database": "fdic-sdi-data",
            "VarName": "eqtot",
            "ShortDescription": "Total equity capital",
            "LongDescription": "Total equity capital on a consolidated basis note: 1) beginning march 2009, includes the non-controlling (minority) interests in consolidated subsidiaries for CALL report and TFR filers.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 146,
            "database": "fdic-sdi-data",
            "VarName": "equptot",
            "ShortDescription": "Undivided profits",
            "LongDescription": "Undivided profits, capital reserves, net unrealized holdings gains (losses) on available-for-sale securities, other equity capital components, and accumulated gains (losses) on cash flow hedges.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 856,
            "database": "fdic-sdi-data",
            "VarName": "eqv",
            "ShortDescription": "Equity capital to assets",
            "LongDescription": "Total equity capital as a percent of total assets.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 151,
            "database": "fdic-sdi-data",
            "VarName": "ernast",
            "ShortDescription": "Earning assets",
            "LongDescription": "All loans and other investments that earn interest or dividend income.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 860,
            "database": "fdic-sdi-data",
            "VarName": "ernast5",
            "ShortDescription": "Average earning assets",
            "LongDescription": "The average of all loans and other investments that earn interest or dividends. Averages are calculated as follows: Year-to-date averages: March reporting period - (December earning assets + March earning assets) / 2 June reporting period - (December earning assets + March earning assets + June earning assets) / 3 September reporting period - (December earning assets + March earning assets + June earning assets + September earning assets) / 4 December reporting period - (Previous December earning assets + March earning assets + June earning assets + September earning assets + December earning assets) / 5 Quarterly averages: All reporting periods ñ (Previous quarter earning assets + current quarter earning assets) / 2",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 445,
            "database": "fdic-sdi-data",
            "VarName": "esal",
            "ShortDescription": "Salaries and employee benefits",
            "LongDescription": "Salaries and employee benefits expense.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 84,
            "database": "fdic-sdi-data",
            "VarName": "established",
            "ShortDescription": "Established",
            "LongDescription": "After Date/Before Date - The date on which the institution began operations.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 317,
            "database": "fdic-sdi-data",
            "VarName": "estymd",
            "ShortDescription": "Established Date",
            "LongDescription": "The date on which the institution began operations.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 1023,
            "database": "fdic-sdi-data",
            "VarName": "esubnd",
            "ShortDescription": "Interest Expense: Subordinated notes and debenture",
            "LongDescription": "Total interest expense on subordinated notes and debentures.",
            "File": "Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 1022,
            "database": "fdic-sdi-data",
            "VarName": "ettlotmg",
            "ShortDescription": "Interest Expense:Demand notes, US treasury & other",
            "LongDescription": "Total interest expense on demand notes issued to the US Treasury, other borrowed money and interest on mortgage indebtedness and obligations under capitalized leases on a consolidated basis.",
            "File": "Total Interest Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 451,
            "database": "fdic-sdi-data",
            "VarName": "extra",
            "ShortDescription": "Extraordinary gains, net",
            "LongDescription": "Extraordinary items and other adjustments, net of income taxes.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 328,
            "database": "fdic-sdi-data",
            "VarName": "fdicdbs",
            "ShortDescription": "FDIC Geographic Region",
            "LongDescription": "The FDIC Office assigned to the geographic area.  The eight FDIC Regions and their respective states are:    Boston - Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island, Vermont  New York - Delaware, District of Columbia, Maryland, New Jersey, New York, Pennsylvania, Puerto Rico, U.S. Virgin Islands  Atlanta - Alabama, Florida, Georgia, North Carolina, South Carolina, Virginia, West Virginia  Memphis - Arkansas, Kentucky, Louisiana, Mississippi, Tennessee  Chicago - Illinois, Indiana, Michigan, Ohio, Wisconsin   Kansas City - Iowa, Kansas, Minnesota, Missouri, Nebraska, North Dakota, South Dakota  Dallas - Colorado, New Mexico, Oklahoma, Texas  San Francisco - Alaska, American Samoa, Arizona, California, Guam, Hawaii, Idaho, Montana, Nevada, Oregon, States of Micronesia, Utah, Washington, Wyoming",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 329,
            "database": "fdic-sdi-data",
            "VarName": "fdicsupv",
            "ShortDescription": "FDIC Supervisory Region",
            "LongDescription": "The supervisory FDIC office assigned to the institution.  The eight FDIC Supervisory Regions and their respective states are:    Boston - Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island, Vermont  New York - Delaware, District of Columbia, Maryland, New Jersey, New York, Pennsylvania, Puerto Rico, U.S. Virgin Islands  Atlanta - Alabama, Florida, Georgia, North Carolina, South Carolina, Virginia, West Virginia  Memphis - Arkansas, Kentucky, Louisiana, Mississippi, Tennessee  Chicago - Illinois, Indiana, Michigan, Ohio, Wisconsin   Kansas City - Iowa, Kansas, Minnesota, Missouri, Nebraska, North Dakota, South Dakota  Dallas - Colorado, New Mexico, Oklahoma, Texas  San Francisco - Alaska, American Samoa, Arizona, California, Guam, Hawaii, Idaho, Montana, Nevada, Oregon, States of Micronesia, Utah, Washington, Wyoming",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 331,
            "database": "fdic-sdi-data",
            "VarName": "fed",
            "ShortDescription": "Federal Reserve District",
            "LongDescription": "The Federal Reserve District in which the institution is physically located.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 330,
            "database": "fdic-sdi-data",
            "VarName": "fldoff",
            "ShortDescription": "FDIC Field Office",
            "LongDescription": "The FDIC Field Office where an institution is physically located.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 122,
            "database": "fdic-sdi-data",
            "VarName": "frepo",
            "ShortDescription": "Federal funds sold and reverse repurchase",
            "LongDescription": "Total federal funds sold and securities purchased under agreements to resell in domestic offices.  Includes only federal Funds sold for TRF Reporters before March 1998.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 136,
            "database": "fdic-sdi-data",
            "VarName": "frepp",
            "ShortDescription": "Federal funds purchased and repurchase agreements",
            "LongDescription": "Total federal funds purchased and securities sold under agreements to repurchase in domestic offices. Thrift Financial Reports include only federal funds purchased.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 367,
            "database": "fdic-sdi-data",
            "VarName": "fx",
            "ShortDescription": "Foreign exchange rate contracts",
            "LongDescription": "Notional amount of all foreign exchange contracts.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 369,
            "database": "fdic-sdi-data",
            "VarName": "fxffc",
            "ShortDescription": "Commitments to purchase foreign currencies & U.S. dollar exchange",
            "LongDescription": "Futures and forward foreign exchange contract commitments (gross amounts).  The gross amount of contracts committing the reporting institution to purchase foreign currencies and U.S. dollar exchange, whose predominant risk characteristic is foreign exchange risk.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 368,
            "database": "fdic-sdi-data",
            "VarName": "fxnvs",
            "ShortDescription": "Notional value of exchange swaps",
            "LongDescription": "The notional principal amount (in U.S. dollars) of all cross-currency interest rate swaps.  The notional amount of a cross-currency interest rate swap is generally the underlying principal amount upon which the exchange is based.  A cross-currency interest rate swap is a transaction in which two parties agree to exchange principal amounts of different currencies (usually at the prevailing spot rate) at the inception of an agreement, which lasts for a certain number of years.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 372,
            "database": "fdic-sdi-data",
            "VarName": "fxpoc",
            "ShortDescription": "Purchased option contracts",
            "LongDescription": "The contract amount of option contracts where the reporting bank has, for a fee, purchased the right to either purchase or sell an equity instrument, equity index, a commodity, or product not reportable as an interest rate or foreign exchange contract.  The predominant risk characteristic is foreign exchange risk.  It includes purchased exchange-traded foreign exchange options and purchased OTC foreign exchange options (gross amounts).",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 370,
            "database": "fdic-sdi-data",
            "VarName": "fxspot",
            "ShortDescription": "Spot foreign exchange rate contracts",
            "LongDescription": "The gross amount of all spot contracts committing the institution to purchase foreign currencies and U.S. dollar exchange.  A spot contract is an agreement for immediate delivery of a foreign currency at the prevailing cash market rate.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 371,
            "database": "fdic-sdi-data",
            "VarName": "fxwoc",
            "ShortDescription": "Written option contracts",
            "LongDescription": "The gross amount of contracts where the reporting institution has obligated itself to purchase or sell an equity instrument or equity index under exchange-traded option contracts and over-the-counter (OTC) option contracts, whose predominant risk characteristic is foreign exchange risk.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 408,
            "database": "fdic-sdi-data",
            "VarName": "hctmult",
            "ShortDescription": "Bank Holding Company Type",
            "LongDescription": "Select from Multibank Holding Companies (HCs); One Bank HCs or both Multibank and One Bank HCs.",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 450,
            "database": "fdic-sdi-data",
            "VarName": "ibefxtr",
            "ShortDescription": "Income before extraordinary items",
            "LongDescription": "Income (loss) before security transactions, extraordinary items and other adjustments.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 1027,
            "database": "fdic-sdi-data",
            "VarName": "ichbal",
            "ShortDescription": "Interest Income: Balance due from depository inst",
            "LongDescription": "Total interest income on balances due from depository institutions.  Excludes savings institutions filing a Thrift Financial Report.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 875,
            "database": "fdic-sdi-data",
            "VarName": "idahta",
            "ShortDescription": "Assets held in trading accounts for TFR Reporters",
            "LongDescription": "Assets held in trading accounts for those institutions that are tfr reporters. ris definition = idahta = sum(scus, SCMUNI, SCDOMO, SCFORD, SCEQ, -SC, -SCRES)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 490,
            "database": "fdic-sdi-data",
            "VarName": "idcrredm",
            "ShortDescription": "Real estate loans in domestic offices",
            "LongDescription": "The total amount of recoveries of loans secured by real estate and held in domestic offices of the institution.<BR><BR>RIS definition:<BR>YR - IDCRREDM = SUM(CRRECONS, CRREAG, CRRERES, CRREMULT, CRRENRES)<BR>QTR - IDCRREDQ = SUM(CRRECONQ, CRREAGQ, CRRERESQ, CRREMULQ, CRRENRSQ)",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 359,
            "database": "fdic-sdi-data",
            "VarName": "idctder",
            "ShortDescription": "Notional amount of credit derivatives",
            "LongDescription": "Notional amount of credit derivatives on which the institution is either the guarantor or beneficiary.  Credit derivatives are off-balance sheet arrangements that allow one party (the beneficiary) to transfer the credit risk of an asset to another party (the guarantor).<BR><BR>RIS definition: IDCTDER = (CTDERGTY + CTDERBEN)",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 135,
            "database": "fdic-sdi-data",
            "VarName": "iddepinr",
            "ShortDescription": "% insured (estimated)",
            "LongDescription": "Estimated amount of insured deposits as a percent of total deposit liabilities before exclusions (gross) as defined in section 3(l) of the Federal Deposit Insurance Act and FDIC regulations.<br><br>Available in the FDIC Institution Directory beginning in March 2009. <br><br>NOTE: Although standard FDIC insurance coverage was temporarily raised from $100,000 to $250,000 in October 2008, institutions are required to report the source elements for this estimate based on the $100,000 coverage limit through June 2009. Beginning with the September 30, 2009 reporting period, institutions are required to report based on the $250,000 coverage limit. <br><br>RIS definition: IDDEPINR = (DEPINS / DEPBEFEX) *100",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 346,
            "database": "fdic-sdi-data",
            "VarName": "IDdeplam",
            "ShortDescription": "Amount ($) - deposit accounts of more than $250,000",
            "LongDescription": "Beginning September 2009, amount($) of deposit accounts of more than $250,000 held in domestic offices and in insured branches in Puerto Rico and U.S. territories and possessions. ris definition: if >= sept 2009 then iddeplam = deplgamt",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 347,
            "database": "fdic-sdi-data",
            "VarName": "IDdeplgb",
            "ShortDescription": "Number (#) - deposit accounts of more than $250,000",
            "LongDescription": "Beginning September 2009, number of individual deposit accounts of more than $250,000 held in domestic offices and insured U.S. branches of a foreign chartered institutions (IBAs). ris definition: if >= sept 2009 then iddeplgb = deplgb",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 341,
            "database": "fdic-sdi-data",
            "VarName": "IDdepsam",
            "ShortDescription": "Amount ($) - deposit accounts equal to or less than $250,000",
            "LongDescription": "Beginning September 2009, amount of deposit accounts of $250,000 or less (excluding retirement accounts) held in domestic offices and in insured branches in Puerto Rico and U.S. territories and possessions. Amounts are reported based on the temporary increase to the standard insurance limit to $250,000. ris definition: if >= sept 2009 then iddepsam = depsmamt;",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 342,
            "database": "fdic-sdi-data",
            "VarName": "IDdepsmb",
            "ShortDescription": "Number (#) - deposit accounts equal to or less than $250,000",
            "LongDescription": "Beginning September 2009, number (#) of deposit accounts of $250,000 or less held in domestic offices. This is listed as a memoranda only. call reporters provide this item only on the june call report. tfr reporters provide this item each quarter. ris Definition: if >= Sept 2009 then IDdepsmb = depsmb",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 848,
            "database": "fdic-sdi-data",
            "VarName": "iddivnir",
            "ShortDescription": "Cash dividends to net income (ytd only)*",
            "LongDescription": "Total of all cash dividends declared (year-to-date, annualized) as a percent of net income (year-to-date, annualized). * this ratio is not available on a quarterly basis. if the denominator is less than or equal to zero, then ratio is shown as 'N/A.' RIS definition = IDDIVNIR = (EQCDIVA / NETINCA) *100",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 468,
            "database": "fdic-sdi-data",
            "VarName": "iddrredm",
            "ShortDescription": "Real estate loans in domestic offices",
            "LongDescription": "The total amount of charged-off loans secured by real estate and held in domestic offices of the institution.<BR><BR>RIS definitions: <br> YTD -IDDRREDM = SUM(DRRECONS, DRREAG, DRRERES, DRREMULT, DRRENRES)<br> QTR - IDDRREDQ = sum(drreconq,drreagq,drreresq,drremulq,drrenrsq)",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 57,
            "database": "fdic-sdi-data",
            "VarName": "IDEOTH",
            "ShortDescription": "Additional noninterest expense",
            "LongDescription": "This includes all other operating expenses of the institution. These may consist of net (gains) or losses on OREO, loans sales, fixed assets sales, amortization of intangible assets, or other itemized expenses. Beginning in June 1996, this does not include losses on asset sales for TFR reporters. Such gains (losses) are included net in noninterest income.<BR><BR>RIS definition: <BR>YR - IDEOTH = EOTHNINT + EAMINTAN (>2000) or IDEOTH=EOTHNINT<BR>QTR - IDOTHNIQ = NONIIQ - SUM(IFIDUCQ, ISERCHGQ, IGLTRDQ)",
            "File": "Additional Noninterest Expense.csv; Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 845,
            "database": "fdic-sdi-data",
            "VarName": "iderncvr",
            "ShortDescription": "Earnings coverage of net charge-offs (x)",
            "LongDescription": "Income before income taxes and extraordinary items and other adjustments, plus provisions for loan and lease losses and allocated transfer risk reserve, plus gains (losses) on securities not held in trading accounts (annualized) divided by net loan and lease charge-offs (annualized). This is a number of times ratio (x) not a percentage ratio (%). * if the denominator is less than or equal to zero, then ratio is shown as 'n/a. ris definition = iderncvr = chfla / ntlnlsa",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 379,
            "database": "fdic-sdi-data",
            "VarName": "IDFRANUM",
            "ShortDescription": "Number of Fiduciary Accounts and Related Asset Accounts",
            "LongDescription": "The total number of Fiduciary Accounts and Related Asset Accounts ris definition: idfranum = ttnanum + ttnmnum",
            "File": "Fiduciary and Related Services.csv",
            "AON": "numeric"
        },
        {
            "V1": 702,
            "database": "fdic-sdi-data",
            "VarName": "idFRANUM",
            "ShortDescription": "Number of Fiduciary Accounts and Related Asset Accounts",
            "LongDescription": "The total number of Fiduciary Accounts and Related Asset Accounts ris definition: idfranum = ttnanum + ttnmnum",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 854,
            "database": "fdic-sdi-data",
            "VarName": "idlncorr",
            "ShortDescription": "Net loans and leases to core deposits",
            "LongDescription": "Loan and lease financing receivables, net of allowances and reserves, as a percent of core deposits. The core deposit definition was changed in March 2011. core deposits held in domestic offices now includes: total domestic office deposits minus time deposits of more than $250,000 held in domestic offices and brokered deposits of $250,000 or less held in domestic offices. Prior to the March 2010, core deposits were calculated as total domestic office deposits minus time deposits of $100,000 or more held in domestic offices. RIS definition: IDLNCORR = (LNLSNET / COREDEP) *100",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 941,
            "database": "fdic-sdi-data",
            "VarName": "idlndacf",
            "ShortDescription": "Loans to Depository Institutions  & Acceptances of Other Banks ñ Foreign offices",
            "LongDescription": "Acceptances of U.S. banks held in foreign offices, acceptances of foreign banks held in foreign offices and loans to depository institutions held in foreign offices. Beginning June 2001 it includes acceptances for IBAS also.<BR><BR>RIS definition: IDLNDACF = SUM(LNDEPAC, -LNDEPACD, 0)",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 646,
            "database": "fdic-sdi-data",
            "VarName": "idlnls",
            "ShortDescription": "Loans and leases, gross",
            "LongDescription": "Loans and lease financing receivables of the institution, including unearned income.<BR><BR>RIS definition: IDLNLS = LNLS or SUM(LNLSGR, LNCONTRA, -uninc) <=9606",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 799,
            "database": "fdic-sdi-data",
            "VarName": "IDNAREDM",
            "ShortDescription": "Real estate loans in domestic offices in nonaccrual status",
            "LongDescription": "Total loans in domestic offices of the institution that are secured by real estate and are no longer accruing interest.<BR><BR>RIS definition: IDNAREDM = SUM(NARECONS, NAREAG, NARERES, NAREMULT, NARENRES)",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 687,
            "database": "fdic-sdi-data",
            "VarName": "idnccir",
            "ShortDescription": "% Loans noncurrent:Commercial and industrial loans",
            "LongDescription": "Commercial and industrial loans 90 days or more past due and nonaccrual as a percent of total commercial and industrial loans. Note: For banks with assets of less than $300 million prior to 2001, this item includes all other loans (loans to depository institutions, agricultural loans, etc...). ris definition: idnccir = (ncci / lnci) * 100",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 688,
            "database": "fdic-sdi-data",
            "VarName": "idncconr",
            "ShortDescription": "% Loans Noncurrent: Loans to individuals",
            "LongDescription": "Loans to individuals for household, family and other personal expenditures 90 days or more past due and nonaccrual as a percent of total consumer loans. ris definition: idncconr = (nccon/lncon)* 100",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 690,
            "database": "fdic-sdi-data",
            "VarName": "idnccoor",
            "ShortDescription": "% Loans Noncurrent: Other loans to individuals",
            "LongDescription": "Other loans to individuals for household, family and other personal expenditures 90 days or more past due and nonaccrual as a percent of total other loans to individuals (includes single payment, installment and all student loans). ris definition: idnccoor = ((ncconoth + ncauto) / (lnconorp + lnauto)",
            "File": "Noncurrent loans to loans.csv",
            "AON": "alpha"
        },
        {
            "V1": 689,
            "database": "fdic-sdi-data",
            "VarName": "idnccrdr",
            "ShortDescription": "% Loans Noncurrent: Credit card loans",
            "LongDescription": "Credit card loans to individuals for household, family and other personal expenditures 90 days or more past due and nonaccrual as a percent of total credit card and related plan loans. note: prior to 2001, included revolving credit plans other than credit cards. ris definition:idnccrdr = (nccrcd / lncrcd)* 100",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 693,
            "database": "fdic-sdi-data",
            "VarName": "idncgtpr",
            "ShortDescription": "Wholly or partially US Gov. guaranteed noncurrent loans as percent of noncurrent",
            "LongDescription": "Noncurrent Loans and leases wholly or partially guaranteed or insured by the U.S. Government as a percent of total noncurrent loans and leases. Noncurrent loans and leases are loans that are past due 90 days or more or in nonaccrual status. The U.S. Government includes its agencies and its government-sponsored agencies. Examples include loans guaranteed by the FDIC (through loss-sharing arrangements in FDIC-assisted acquisitions), the Small Business Administration, and the Federal Housing Administration. Excluded are loans and leases guaranteed or insured by state or local governments, state or local government agencies, foreign (non-U.S.) governments, and private agencies or organizations. Also excluded are loans and leases collateralized by securities issued by the U.S. Government, including its agencies and its government-sponsored agencies. Included in noncurrent total assets. ris definition = idncgtpr =(ncgtypar / nclnls) *100",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 691,
            "database": "fdic-sdi-data",
            "VarName": "idncothr",
            "ShortDescription": "% Loans Noncurrent: All other loans and leases",
            "LongDescription": "Other loans and leases (including loans to depository institutions and acceptances of other banks, loans to foreign governements and official institutions, lease financing receivables, and loans to finance agricultural production and other loans to farmers) which are 90 days or more past due and nonaccrual as a percent of total other loans and leases. ris definition: idncothr = ((ncdep + ncfg + ncothln + ncls + ncag) / (lnotci + lnag)) * 100",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 638,
            "database": "fdic-sdi-data",
            "VarName": "idntcir",
            "ShortDescription": "% Net Loans Charged-off: Commercial and industrial",
            "LongDescription": "Net charged-off commercial and industrial loans (annualized) as a percent of average total commercial and industrial loans. ris definitions: ytd - idntcir = (ntcia/lnci5)* 100 qtr - idntciqr = ((ntciq * 4) / lnci22) * 100",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 639,
            "database": "fdic-sdi-data",
            "VarName": "idntconr",
            "ShortDescription": "% Net Loans Charged-off: Loans to individuals",
            "LongDescription": "Net charged-off loans to individuals for household, family and other personal expenditures (annualized) as a percent of average total loans to individuals. ris definitions: ytd - idntconr = (ntcona/lncon5) * 100 qtr - idntcnqr = ((ntconq * 4) / lncon2) * 100",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 641,
            "database": "fdic-sdi-data",
            "VarName": "idntcoor",
            "ShortDescription": "% Net Loans Charged-off: Other loans to individual",
            "LongDescription": "Net charged-off other loans to individuals for household, family and other personal expenditures (annualized) as a percent of average total other loans to individuals. ris definitions: ytd - idntcoor = (( ntconota+ntautoa) / (lnconot5+lnauto5)) * 100 qtr - idntcoqr = ((ntconotq + ntautoq)*4 / (lnconot2 + lnauto2))* 100",
            "File": "Net charge-offs to loans.csv",
            "AON": "alpha"
        },
        {
            "V1": 640,
            "database": "fdic-sdi-data",
            "VarName": "idntcrdr",
            "ShortDescription": "% Net Loans Charged-off: Credit card loans",
            "LongDescription": "Net charged-off credit card loans to individuals (annualized) as a percent of average total credit card and related plan loans. note: prior to 2001, included revolving credit plans other than credit cards. ris definitions: ytd - IDNTCRDR = (NTCRCDA/LNCRCD5) * 100 QTR - IDNTCDQR = ((NTCRCDQ * 4) / LNCRCD2) * 100",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 832,
            "database": "fdic-sdi-data",
            "VarName": "idntigr",
            "ShortDescription": "% of insitutions with earnings gains",
            "LongDescription": "The percent of institutions that increased their net income (or decreased their losses) compared to the same period a year earlier. Available for peer group data only. ris definition = idntigr = (ntinchpp/instcnt) *100 (macro only)",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 831,
            "database": "fdic-sdi-data",
            "VarName": "idntilr",
            "ShortDescription": "% of unprofitable institutions",
            "LongDescription": "The percent of institutions whose year-to-date net income was negative. Available for peer group data only.<BR><BR>RIS definition:<BR>YR - IDNTILR = (NTINCL / INSTCNT) *100 (Macro only)<BR>QTR - IDNTILRQ = (NTINCLQ / INSTCNT) *100 (Macro only)",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 642,
            "database": "fdic-sdi-data",
            "VarName": "idntothr",
            "ShortDescription": "% Net Loans Charged-off: All other loans and lease",
            "LongDescription": "Net charged-off loans to depository institutions and acceptances of other banks, loans to foreign governments and official institutions, lease financing receivables, loans to finance agricultural production and all other loans (annualized) as a percent of average total other loans and leases. ris definitions: ytd - idntothr = ((((ntdep + ntforgv + ntother + ntls) * idann) + ntaga) / (lnotci5 + lnag5)) * 100 qtr - idntotqr = (((ntdepq + ntforgvq + ntothq + ntlsq + ntagq) * 4) / (lnotci2 + lnag22)) * 100",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 511,
            "database": "fdic-sdi-data",
            "VarName": "idntredm",
            "ShortDescription": "Real estate loans in domestic offices",
            "LongDescription": "The net amount of charged-off loans secured by real estate and held in domestic offices of the institution.<BR><BR>RIS definition:<BR>YR - IDNTREDM = SUM(NTRECONS, NTREAG, NTRERES, NTREMULT, NTRENRES)<BR>QTR - IDNTREDQ = SUM(NTRECONQ,NTREAGQ,NTRERESQ,NTREMULQ,NTRENRSQ)",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 129,
            "database": "fdic-sdi-data",
            "VarName": "idoa",
            "ShortDescription": "All other assets",
            "LongDescription": "All other assets include investments in unconsolidated subsidiaries, customers' liability on acceptances outstanding, income earned not collected on loans, net deferred tax assets, excess residential mortgage servicing fees receivable and other assets. Beginning in June 2009, includes direct and indirect investments in real estate ventures for CALL Reporters.<br><br>RIS definition: IDOA = SUM(OA, INVSUB, CUSLI) or >=0906 IDOA = SUM(OA, INVSUB, CUSLI, INVSUORE)",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 138,
            "database": "fdic-sdi-data",
            "VarName": "idobrmtg",
            "ShortDescription": "Other borrowed funds",
            "LongDescription": "Other borrowed money (excludes deposits, federal funds purchased, securities sold under agreements to repurchase in domestic offices of the bank, and trading liabilities). As of March 1997, includes mortgage indebtedness and obligations under capitalized leases. ris definition = idobrmtg = sum(ttl, othbor, mtgls, 0)",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 140,
            "database": "fdic-sdi-data",
            "VarName": "idoliab",
            "ShortDescription": "All other liabilities",
            "LongDescription": "The bank's liability on acceptances executed and outstanding, interest and other expenses accrued and unpaid (including accrued income taxes payable), net deferred tax liabilities and minority interest in consolidated subsidiaries. as of march 1997, limited-life preferred stock and related surplus are no longer reported here but as a part of subordinated debt. effective january 1, 1994, revaluation losses on assets held in trading accounts are included in trading liabilities. Beginning March 2009, non-controlling (minority) interests in consolidated subsidiaries are a component of equity capital and not included in this item. RIS definition = IDOLIAB = SUM(OLMIN, ACEPT, LLPFDSTK, 0)",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 667,
            "database": "fdic-sdi-data",
            "VarName": "idothlns",
            "ShortDescription": "Other loans",
            "LongDescription": "All other loans on a consolidated basis plus prepaid taxes and insurance on mortgage loans for TFR reporters.<BR><BR>RIS definition: IDOTHLNS = SUM(LNOTHER, LNREPP)",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 62,
            "database": "fdic-sdi-data",
            "VarName": "idothnii",
            "ShortDescription": "Additional Noninterest Income",
            "LongDescription": "Includes the following noninterest income: investment banking, advisory, brokerage, and underwriting;Venture capital revenue;Net Servicing fees;Net securitization income;Insurance commission fees and income;Net gains (losses) on sales of loans;Net gains (losses) on sales of real estate owned;Net gains (losses) on sales of other assets (excluding securities);and Other noninterest income. RIS definition = IDOTHNII = NONII - SUM(IFIDUC, ISERCHG, IGLTRAD)",
            "File": "Additional Noninterest Income.csv; Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 745,
            "database": "fdic-sdi-data",
            "VarName": "IDP3REDM",
            "ShortDescription": "Real estate loans in domestic offices, past due 30  -  89 days",
            "LongDescription": "Total loans in domestic offices of the institution that are secured by real estate and are past due 30 through 89 days and still accruing interest.<BR><BR>RIS definition: IDP3REDM = SUM(P3RECONS, P3REAG, P3RERES, P3REMULT, P3RENRES)",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 772,
            "database": "fdic-sdi-data",
            "VarName": "IDP9REDM",
            "ShortDescription": "Real estate loans in domestic offices, past due 90+ days",
            "LongDescription": "Total loans in domestic offices of the institution that are secured by real estate and are past due more than 90 days and still accruing interest.<BR><BR>RIS definition: IDP9REDM = SUM(P9RECONS, P9REAG, P9RERES, P9REMULT, P9RENRES)",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 447,
            "database": "fdic-sdi-data",
            "VarName": "idpretx",
            "ShortDescription": "Pre-tax net operating income",
            "LongDescription": "Net income (loss) before income taxes and extraordinary items and other adjustments minus gains (losses) on securities not held in trading accounts.<BR><BR>RIS definition:<BR>YR - IDPRETX = SUM(IBEFTAX, -IGLSEC)<BR>QTR - IDPRETXQ = SUM(IBEFTXQ, -IGLSECQ)",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 882,
            "database": "fdic-sdi-data",
            "VarName": "idsccmo",
            "ShortDescription": "Collaterized mortgage obligations",
            "LongDescription": "Mortgage-backed securities (CMOs and REMICS) held-to-maturity at amortized cost and available-for-sale at fair value which are either issued or guaranteed through FNMA or FHLMC, or privately issued and collateralized by mortgage-backed securities issued or guaranteed by FNMA, FHLMC, or GNMA and all other privately-issued. This includes securities held in trading accounts and privately issued collateralized mortgage obligations (REMICS) fortfr reporters. ris definition = idsccmo = (sccol + scodpi)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 885,
            "database": "fdic-sdi-data",
            "VarName": "idsccmt",
            "ShortDescription": "Commercial mortgage-backed securities",
            "LongDescription": "Commercial mortgage pass-through securities and other commercial mortgage-backed securities (issued by U.S. government-sponsored agencies or by others) on a consolidated basis<BR><BR>RIS definition: IDSCCMT = SUM(SCCMPT, SCCMOT)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 879,
            "database": "fdic-sdi-data",
            "VarName": "idscgtpc",
            "ShortDescription": "Certificates of participation in pools of residential mortgages",
            "LongDescription": "Mortgage-backed pass-through securities held-to-maturity at amoritized cost and available-for-sale at fair value, which are either issued or guaranteed through FNMA, FHLMC, or GNMA or privately-issued. This includes securities held in trading accounts for tfr reporters. ris definition = idscgtpc = (scgty + scodpc)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 868,
            "database": "fdic-sdi-data",
            "VarName": "idscod",
            "ShortDescription": "Privately issued residential mortgage-backed securities",
            "LongDescription": "Mortgage-backed pass-through securities and mortgage-backed securities ñ (CMOs) and (REMICs) - privately-issued and collateralized by MBS issued or guaranteed by FNMA, FHLMC, or GNMA and all other privately-issued held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis<BR><BR> <b>Note:</b><BR>1) Prior to June 2009, this item included commercial mortgage pass-through securities and commercial mortgage-backed securities <BR>2) Includes the aforementioned securities held in trading accounts for TFR filers<BR><BR>RIS definition: IDSCOD = SUM(SCODPC, SCODPI)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 599,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCAUT",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit  Auto Loans",
            "LongDescription": "Auto Loans - Maximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of:Standby Letters Of Credit And Other Enhancements - Auto Loans. ris defintions: use szslcaut when >= 2003 and prior to 20030102 use szlcauto.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 598,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCCCD",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit  Credit Cards Rec.",
            "LongDescription": "Credit Cards Receivables - Maximum Amount Of Credit Exposure Arising From Recourse or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of:Standby Letters Of Credit and Other Enhancements - Credit Card Receivables. ris definitions: use szslccrd when >= 2003 and prior to 20030101 use szlccrd.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 601,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCCCI",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit  C&I Loans",
            "LongDescription": "Commercial & Industrial Loans\t Maximum Amount Of Credit Exposure Arising From Recourse\t Or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of:\t Standby Letters Of Credit And Other Enhancements -\t Commercial And Industrial Loans. ris definitions: use szslcci when >= 2003 and prior to 2003 use szlcci.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 600,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCCON",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit  Other Consumer Lns",
            "LongDescription": "Other Consumer Loans,Maximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of: Standby Letters Of Credit And Other Enhancements - Other Consumer Loans. ris definitions: use szslccon >= 2003 and prior to 2003 use szlccon.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 597,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCHEL",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit Home Equity Lines",
            "LongDescription": "Home Equity Lines - Maximum Amount Of Credit Exposure Arising From Recourse or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of:Standby Letters Of Credit And Other Enhancements - Home Equity Lines. ris defintions: use szslchel when >= 2003 and prior to 20030101 use szlchel.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 602,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCOTH",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit All Other Lns. & Ls",
            "LongDescription": "All Other Loans and All Leases Maximum Amount Of Credit Exposure Arising From Recourse Or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of: Standby Letters Of Credit And Other Enhancements - Other Loans, All Leases and Other Assets. ris definitions: use szslcoth >= 2003 and prior to 2003 use szlcoth.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 596,
            "database": "fdic-sdi-data",
            "VarName": "IDSLCRES",
            "ShortDescription": "Maximum Amount of Credit Exposure, Standby Letters of Credit 1-4 Family Res. Lns",
            "LongDescription": "1-4 Family Residential Loans, Maximum Amount Of Credit Exposure Arising From Recourse or Other Seller-Provided Credit Enhancements Provided To Structures Reported In RC-S, Item 1 In The Form Of: Standby Letters Of Credit And Other Enhancements - 1-4 Family Residential Loans.\t ris definitions: use szslcres when >=2003 and prior to 20030101 use szlcres.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 382,
            "database": "fdic-sdi-data",
            "VarName": "IDTFRA",
            "ShortDescription": "Total fiduciary and related assets",
            "LongDescription": "The sum of managed and non-managed assets reported quarterly by institutions with total fiduciary assets greater than $250 million (prior December) or with fiduciary and related services income greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. ris definition: idtfra = ttma + ttnma",
            "File": "Derivatives.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 980,
            "database": "fdic-sdi-data",
            "VarName": "idtrcomb",
            "ShortDescription": "Commercial banks and other depository institutions in U.S.",
            "LongDescription": "Total transaction and nontransaction accounts of commercial banks and other depository institutions that held in both domestic and foreign offices.<BR><BR>RIS definition: IDTRCOMB = (TRNCBO + NTRCOMOT)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 981,
            "database": "fdic-sdi-data",
            "VarName": "idtrnfc",
            "ShortDescription": "Banks in foreign countries",
            "LongDescription": "Total transaction and nontransaction accounts of banks in foreign countries held in both domestic and foreign offices.  It also includes IBFs established by U.S. branches and agencies of foreign banks.  This item is not reported by institutions with less than $100 million in total assets.<BR><BR>RIS definition: IDTRNFC = (TRNFC + NTRFC)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 982,
            "database": "fdic-sdi-data",
            "VarName": "idtrnfg",
            "ShortDescription": "Foreign governments and official institutions",
            "LongDescription": "Total transaction and nontransaction accounts of foreign governments and official institutions (includes foreign central banks) held in both domestic and foreign offices.  This item is not reported by institutions with less than $100 million in total assets. <BR><BR>RIS definition: IDTRNFG = (TRNFG + NTRFG)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 978,
            "database": "fdic-sdi-data",
            "VarName": "idtrngov",
            "ShortDescription": "U.S. Government",
            "LongDescription": "Total transaction and nontransaction accounts of federal public funds made by or for the account of the U.S. government which are held in domestic offices.  It includes U.S. Treasury tax and loan accounts, standing deposits to the credit of certain quasi-governmental institutions and deposits of the U.S. Postal Service and local post offices.<BR><BR>RIS definition = IDTRNGOV = (TRNUSGOV + NTRUSGOV)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 977,
            "database": "fdic-sdi-data",
            "VarName": "idtrni",
            "ShortDescription": "Individuals, partnerships, and corporations",
            "LongDescription": "Total transaction and nontransaction accounts of individuals, partnerships and corporations (including all certified and official checks) held in both domestic and foreign offices. prior to 2004, this item is not available for tfr reporters with assets less than $300 million and risk-based capital ratios in excess of 12 percent. RIS definition = IDTRNI = (TRNIPCOC + NTRIPC)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 979,
            "database": "fdic-sdi-data",
            "VarName": "idtrnmu",
            "ShortDescription": "States and political subdivisions in the U.S.",
            "LongDescription": "Total transaction and nontransaction accounts of states, counties, municipalities, and local housing authorities (or political subdivisions) held in domestic offices.  Included are deposits of funds advanced to states and political subdivisions by the U.S. government and corporations, and deposits of withheld income taxes of states and political subdivisions. <BR><BR>RIS definition: IDTRNMU = (TRNMUNI + NTRMUNI)",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 893,
            "database": "fdic-sdi-data",
            "VarName": "idtrrval",
            "ShortDescription": "Revaluation gains on off-balance sheet contracts",
            "LongDescription": "Trading liabilities revaluation gains on interest rate, foreign exchange rate, and other commodity and equity contracts.  This item is only available for banks with $1 billion or more in total assets or banks with $2 billion or more in notional amount of interest rate, foreign exchange rate, and other commodity and equity contracts.<BR><BR>RIS definition: IDTRRVAL = (TRREVALD + TRREVALF)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 385,
            "database": "fdic-sdi-data",
            "VarName": "IFIDUC",
            "ShortDescription": "Gross Fiduciary activities  income",
            "LongDescription": "Income from services rendered by the institution's trust department or by any of its consolidated subsidiaries acting in any fiduciary capacity.   This item is not available for TFR Reporters.",
            "File": "Derivatives.csv; Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 441,
            "database": "fdic-sdi-data",
            "VarName": "ifiduc",
            "ShortDescription": "Gross Fiduciary activities  income",
            "LongDescription": "Income from services rendered by the institution's trust department or by any of its consolidated subsidiaries acting in any fiduciary capacity.   This item is not available for TFR Reporters.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 1030,
            "database": "fdic-sdi-data",
            "VarName": "ifrepo",
            "ShortDescription": "Interest income: Federal funds sold",
            "LongDescription": "Interest income on federal funds sold and securities purchased under agreements to resell in domestic offices of the bank.  This item is not available for TFR Reporters.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1050,
            "database": "fdic-sdi-data",
            "VarName": "iglcmex",
            "ShortDescription": "Commondity and other exposures",
            "LongDescription": "Trading revenues on commodity and other exposures such as cash instruments and off-balance sheet derivative instruments.  Beginning in 2001, this item is only required to be filed banks that reported average trading assets (in the FFIEC Call Report Schedule RC-K, item 7) of $2 million or more for any quarter of the preceding calendar year.  This item is not available for TFR Reporters",
            "File": "Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 1051,
            "database": "fdic-sdi-data",
            "VarName": "IGLCREX",
            "ShortDescription": "Trading revenues on credit exposures",
            "LongDescription": "Trading revenues on credit exposures (from cash instrumentsand derivative instruments)<br><br>Available starting in 2007. This item is only required to be filed banks that reported average trading assets (in the FFIEC Call Report Schedule RC-K, item 7) of $2 million or more for any quarter of the preceding calendar year.<P>This item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A></P>",
            "File": "Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 1049,
            "database": "fdic-sdi-data",
            "VarName": "igledex",
            "ShortDescription": "Equity security and index exposures",
            "LongDescription": "Trading revenues on equity security and index exposures such as cash instruments and off-balance sheet derivative instruments.  Beginning in 2001, this item is only required to be filed banks that reported average trading assets (in the FFIEC Call Report Schedule RC-K, item 7) of $2 million or more for any quarter of the preceding calendar year.  This item is not available for TFR Reporters",
            "File": "Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 1048,
            "database": "fdic-sdi-data",
            "VarName": "iglfxex",
            "ShortDescription": "Foreign exchange exposures",
            "LongDescription": "Trading revenues on foreign exchange exposures such as cash instruments and off-balance sheet derivative instruments.  Beginning in 2001, this item is only required to be filed banks that reported average trading assets (in the FFIEC Call Report Schedule RC-K, item 7) of $2 million or more for any quarter of the preceding calendar year.  This item is not available for TFR Reporters",
            "File": "Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 1047,
            "database": "fdic-sdi-data",
            "VarName": "iglrtex",
            "ShortDescription": "Interest rate exposures",
            "LongDescription": "Trading revenues on interest rate exposures such as cash instruments and off-balance sheet derivative instruments.  Beginning in 2001, this item is only required to be filed banks that reported average trading assets (in the FFIEC Call Report Schedule RC-K, item 7) of $2 million or more for any quarter of the preceding calendar year.  This item is not available for TFR Reporters",
            "File": "Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 448,
            "database": "fdic-sdi-data",
            "VarName": "iglsec",
            "ShortDescription": "Securities gains (losses)",
            "LongDescription": "Realized gains (losses) on held-to-maturity and available-for-sale securities, before adjustments for income taxes. Thrift Financial Reporters also include gains (losses) on the sale of other assets held for sale.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 443,
            "database": "fdic-sdi-data",
            "VarName": "igltrad",
            "ShortDescription": "Trading account gains and fees",
            "LongDescription": "Net gains and losses from trading cash instruments and off-balance sheet derivative contracts (including commodity contracts) that have been recognized during the accounting period.",
            "File": "Gross Fiduciary and Related Services Income.csv; Trading Account Gains & Fees.csv",
            "AON": "numeric"
        },
        {
            "V1": 67,
            "database": "fdic-sdi-data",
            "VarName": "iinscom",
            "ShortDescription": "Insurance commission fees and income",
            "LongDescription": "Reported income from underwriting insurance, from the sale of insurance or from reinsurance.  Including fees, commissions, service charges, etcÖ Available beginning in March 2001.   This item is not available for TFR Reporters",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 69,
            "database": "fdic-sdi-data",
            "VarName": "iinsoth",
            "ShortDescription": "Other insurance commissions and fees",
            "LongDescription": "This item is available beginning in March 2003. income from insurance product sales and referrals, including: (1) Service charges, commissions, and fees earned from insurance sales, including credit, life, health, property, casualty, and title insurance products as well as annuities (fixed, variable, and deferred). (2) Fees earned from customer referrals for insurance products and annuities to insurance companies and insurance agencies external to the consolidated bank. Also include management fees earned from separate accounts, deferred annuities, anduniversal life products. However, this item excludes commissions and fees from sales of annuities by the bank's trust department (or by a consolidated trust company subsidiary) that are executed in a fiduciary capacity. Also excluded are commissions and fees that the bank earns from the sale of annuities to bank customers by the bankís securities brokerage subsidiary (See -'Investment banking, advisory, brokerage, and underwriting fees and commissions'). This item is not available for TFR Reporters.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 68,
            "database": "fdic-sdi-data",
            "VarName": "iinsund",
            "ShortDescription": "Insurance underwriting income",
            "LongDescription": "This item is available beginning in March 2003. the amount of premiums earned by bank subsidiaries engaged in insurance underwriting or reinsurance activities. Included are earned premiums from (a) life and health insurance and (b) property and casualty insurance, whether (direct) underwritten business or ceded or assumed (reinsured) business. Insurance premiums are reported net of any premiums transferred to other insurance underwriters/reinsurers in conjunction with reinsurance contracts. It also includes the bank's proportionate share of the income or loss before extraordinary items and other adjustments from its investments in equity method investees that are principally engaged in insurance underwriting or reinsurance activities. Equity method investees include unconsolidated subsidiaries;associated companies;and corporate joint ventures, unincorporated joint ventures, general partnerships, and limited partnerships over which the bank exercises significant influence. Income from insurance product sales and referrals is excluded (see - Other insurance income and fees). Not available for TFR Reporters.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 63,
            "database": "fdic-sdi-data",
            "VarName": "iinvfee",
            "ShortDescription": "Investment banking, advisory, brokerage, and underwriting fees and commissions",
            "LongDescription": "Investment banking, advisory, brokerage, and underwriting fees and commissions is available beginning in March 2001. It includes, as an example, report fees and commissions from underwriting securities, private placements of securities, investment advisory and management services, or merger and acquisition services. beginning march 2007, these fees and commissions are further broken down and reported as subcategories. also beginning march 2007, this includes fees and commissionsfrom annuity sales from all sources (not just brokerage subsidiaries.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1024,
            "database": "fdic-sdi-data",
            "VarName": "ilndom",
            "ShortDescription": "Interest income: Domestic office loans",
            "LongDescription": "Total interest and fee income on loans held in domestic offices.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 456,
            "database": "fdic-sdi-data",
            "VarName": "ILNFOR",
            "ShortDescription": "Interest income: Foreign office loans",
            "LongDescription": "Total interest and fee income on loans held in foreign offices, edge and agreement subsidiaries and IBF's.",
            "File": "Interest income and expense in foreign offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 1025,
            "database": "fdic-sdi-data",
            "VarName": "ilnfor",
            "ShortDescription": "Interest income: Foreign office loans",
            "LongDescription": "Total interest and fee income on loans held in foreign offices, edge and agreement subsidiaries and IBF's.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1026,
            "database": "fdic-sdi-data",
            "VarName": "ils",
            "ShortDescription": "Interest income: Lease financing receivables",
            "LongDescription": "Total interest income from lease financing receivables.  This item is not available for TFR Reporters.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 91,
            "database": "fdic-sdi-data",
            "VarName": "inbkclass",
            "ShortDescription": "Institution Type",
            "LongDescription": "Institution Type - The legal authorization to conduct business granted to a financial institution by federal or state government. all charters - includes commercial banks, savings institutions and u.s. branches of foreign banks insured by the fdic Insured Commercial Banks - Includes commercial banks insured by the FDIC. These institutions are regulated by one of the three Federal commercial bank regulators (FDIC, Federal Reserve Board or Office of the Comptroller of the Currency). They submit financial reports to the Federal Reserve (state member banks) or the FDIC (state non-member banks and national banks). Insured Savings Institutions - Includes savings institutions insured that operate under state or federal banking codes applicable to thrift institutions. These institutions are regulated by and submit financial reports to one of two Federal regulators (FDIC or Office of the Comptroller of the Currency). Insured Branches of Foreign Banks - Includes insured branches in the U.S. established by banks chartered and headquartered in foreign countries. These institutions are regulated by one of the three Federal commercial bank regulators and submit financial data to the Federal Reserve.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 74,
            "database": "fdic-sdi-data",
            "VarName": "incert1",
            "ShortDescription": "FDIC Certificate#",
            "LongDescription": "A unique number assigned by the FDIC used to identify institutions and for the issuance of insurance certificates.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 409,
            "database": "fdic-sdi-data",
            "VarName": "InCert1",
            "ShortDescription": "FDIC Certificate#",
            "LongDescription": "A unique number assigned by the FDIC used to identify institutions and for the issuance of insurance certificates.",
            "File": "Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 92,
            "database": "fdic-sdi-data",
            "VarName": "inchrtagnt",
            "ShortDescription": "Chartering Agency",
            "LongDescription": "All Chartering Agencies - State and Federal  Comptroller of the Currency - Chartering authority for nationally (federally) chartered commercial banks  Office of Thrift Supervision - Chartering authority for federally chartered savings associations  State (includes U.S. Territories) - Chartering authority for institutions that are not chartered by the OCC or OTS",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 76,
            "database": "fdic-sdi-data",
            "VarName": "incity",
            "ShortDescription": "City",
            "LongDescription": "City in which the headquarters are physically located. Either the entire name or part of the name of a specific city may be entered to produce an list of choices.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 403,
            "database": "fdic-sdi-data",
            "VarName": "InCity",
            "ShortDescription": "City",
            "LongDescription": "City in which the headquarters are physically located. Either the entire name or part of the name of a specific city may be entered to produce an list of choices.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv; Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 77,
            "database": "fdic-sdi-data",
            "VarName": "incounty",
            "ShortDescription": "County",
            "LongDescription": "The name of the county where the institution is physically located.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 97,
            "database": "fdic-sdi-data",
            "VarName": "infdicdbs",
            "ShortDescription": "FDIC Geographic Region",
            "LongDescription": "The FDIC Office assigned to the geographic area.  Select from a drop down box. Click here for regional breakdown.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 87,
            "database": "fdic-sdi-data",
            "VarName": "infindata",
            "ShortDescription": "Size or Performance",
            "LongDescription": "Size criteria (assets or deposits) or net income (year-to-date or quarter) may be selected from a drop-down box. A dollar amount (in millions) must also be entered in one of the two size selection boxes. Criteria will default to the minimum and maximum values if no size criteria is entered.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 83,
            "database": "fdic-sdi-data",
            "VarName": "inflags",
            "ShortDescription": "Frequently Asked Questions",
            "LongDescription": "Top 100 Banks and Thrifts - Use this selection to quickly obtain a list of the largest FDIC-insured institutions according to their total assets. Use most recent or historical reporting dates to identify the impact of mergers and other events. Agricultural Banks - An institution with agricultural loans totaling at least 25% of total loans. Banks Headquartered in the U.S. with Foreign Offices - Commercial banks that file a FFIEC 031 Call Report as required for those institutions with both domestic and foreign offices. Banks Directly Owned by Another Bank - Beginning in March 1997, both the Thrift Financial Reports and Call Reports are completed on a fully consolidated basis. Previously, the consolidation of subsidiary depository institutions was prohibited. Now, parent institutions are required to file consolidated reports, while their subsidiary financial institutions are still required to file separate reports. Trust Powers Granted Institutions that have been granted trust powers by a state or national regulatory authority to administer accounts in a fiduciary capacity. Fiduciary capacity generally means: trustee, executor, administrator, registrar of stocks and bonds, transfer agent, guardian, assignee, receiver, custodian under a uniform gifts to minors act, investment advisor, any capacity in which the institution possesses investment discretion on behalf of another, or any similar capacity. Trust or Related Activity Beyond having granted and exercised trust powers, institutions that have fiduciary assets accounts, income, or other reportable fiduciary related service. Credit Card Institutions - Institutions with total loans greater than 50% of total assets and credit card loans greater than 50% of total loans, including loans that have been securitized and sold. Federal Charter - Nationally chartered commercial banks or OTS chartered savings associations Institutions with Interstate Branches - Institutions that have branches in more than one state that can accept deposits insured by the FDIC. Mutual (non-stock) Savings Institution - A non-stock institution owned and controlled by its depositors. A mutual does not issue capital stock. All commercial banks issue stock and are not mutuals. State Charter - FDIC-insured, state chartered banks that are either members or non-members of the Federal Reserve System Stock Held Institution - A stock institution sells stock to raise capital. It is owned by the shareholders who benefit from profits earned by the institution. Subchapter S Corporations - The Small Business Job Protection Act of 1996 changed the Internal Revenue Code to allow financial institutions to elect Subchapter S corporation status, beginning in 1997. A Subchapter S corporation is treated as a pass-through entity, similar to a partnership, for federal income tax purposes. It is generally not subject to any federal income taxes at the corporate level. Its taxable income flows through to its shareholders in proportion to their stock ownership, and the shareholders generally pay federal income taxes on their share of this taxable income. This can have the effect of reducing institutions' reported taxes and increasing their after-tax earnings. The election of Subchapter S status may result in an increase in shareholders' personal tax liability. Therefore, some S corporations may increase the amount of earnings distributed as dividends to compensate for higher personal taxes.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 98,
            "database": "fdic-sdi-data",
            "VarName": "infldoff",
            "ShortDescription": "FDIC Field Office",
            "LongDescription": "The FDIC Field Office where the institution is physically located. Select from a drop down box.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 89,
            "database": "fdic-sdi-data",
            "VarName": "inhighamount",
            "ShortDescription": "Equal or Less Than",
            "LongDescription": "The value entered here will be used in conjunction with the data element type  from the Size or Performance area to select institutions whos values are equal to or less than the value entered here.If both 'Equal or Greater Than' and 'Equal or Less Than' are used, you can select institutions where values fall within the specifed range.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 86,
            "database": "fdic-sdi-data",
            "VarName": "inhighestdate",
            "ShortDescription": "Established Before Date",
            "LongDescription": "Established Before Date - Institutions will be selected where the Established Date is on or before the Established Before Date.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 95,
            "database": "fdic-sdi-data",
            "VarName": "ininsagnt1",
            "ShortDescription": "Insurance Fund (N/A)",
            "LongDescription": "This option allows the user to locate institutions based on which insurance fund they are members of.   Both BIF and SAIF  Bank Insurance Fund - Institutions that are members of the Bank Insurance Fund  Savings Association Insurance Fund - Institutions that are members of the Savings Association Insurance Fund",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 80,
            "database": "fdic-sdi-data",
            "VarName": "ininststatus",
            "ShortDescription": "Institution Status",
            "LongDescription": "Based on the demographic information, the selections are: active -- institutions that are currently open and insured by the FDIC, as of the date requested. If the data requested is other then Most Current, the institution may no longer be currently active. Inactive -- As of the Most Current data, institutions that are currently closed but were once insured by the FDIC. Inactive institutions include: - institutions that have merged with other institutions - institutions that have been acquired by other institutions - institutions that are no longer in business All -- Both active and inactive institutions as of the Most Current data. Note: Please use FDIC Bank Find to locate an institution based on a former name.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 412,
            "database": "fdic-sdi-data",
            "VarName": "inInstStatus",
            "ShortDescription": "Institution Status",
            "LongDescription": "Based on the demographic information, the selections are: active -- institutions that are currently open and insured by the FDIC, as of the date requested. If the data requested is other then Most Current, the institution may no longer be currently active. Inactive -- As of the Most Current data, institutions that are currently closed but were once insured by the FDIC. Inactive institutions include: - institutions that have merged with other institutions - institutions that have been acquired by other institutions - institutions that are no longer in business All -- Both active and inactive institutions as of the Most Current data. Note: Please use FDIC Bank Find to locate an institution based on a former name.",
            "File": "Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 88,
            "database": "fdic-sdi-data",
            "VarName": "inlowamount",
            "ShortDescription": "Equal or Greater Than",
            "LongDescription": "The value entered here will be used in conjunction with the data element type  from the Size or Performance area to select institutions whos values are equal to or greater than the value entered here.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 85,
            "database": "fdic-sdi-data",
            "VarName": "inlowestdate",
            "ShortDescription": "Established After Date",
            "LongDescription": "Established After Date - Institutions will be selected where the Established Date is on or after the Established After Date.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 75,
            "database": "fdic-sdi-data",
            "VarName": "inname",
            "ShortDescription": "Institution Name",
            "LongDescription": "Name of an institution. The entire name or part (at least 3 characters) of the name of a specific institution may be entered to produce an Institution List of available selections.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 410,
            "database": "fdic-sdi-data",
            "VarName": "InName",
            "ShortDescription": "Institution Name",
            "LongDescription": "Name of an institution. The entire name or part (at least 3 characters) of the name of a specific institution may be entered to produce an Institution List of available selections.",
            "File": "Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 93,
            "database": "fdic-sdi-data",
            "VarName": "inregagnt",
            "ShortDescription": "Federal Regulator",
            "LongDescription": "All Federal Regulators - Includes all four Federal Regulatory Agencies  Federal Deposit Insurance Corporation - Primary Federal regulator responsible for state chartered banks not members of the Federal Reserve System and state chartered savings banks  Federal Reserve Board - Primary Federal regulator responsible for state chartered commercial bank members of the Federal Reserve System  Comptroller of the Currency - Primary Federal regulator responsible for nationally chartered commercial banks  Office of Thrift Supervision - Primary Federal regulator responsible for federally and state-chartered savings associations",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 405,
            "database": "fdic-sdi-data",
            "VarName": "InReptLevel",
            "ShortDescription": "Report Content",
            "LongDescription": "Select the data you would like to retrieve from the drop down box.  These are the possible options:  Assets and Liabilities Income and Expense Performance & Condition Ratios Demographic Information as of quarter All Information",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 326,
            "database": "fdic-sdi-data",
            "VarName": "insagnt1",
            "ShortDescription": "Insurance Fund Membership",
            "LongDescription": "Deposit Insurance Fund(DIF),Bank Insurance Fund (BIF),Savings Association Insurance Fund(SAIF)",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 318,
            "database": "fdic-sdi-data",
            "VarName": "insdate",
            "ShortDescription": "Date of Deposit Insurance",
            "LongDescription": "The date that an institution obtained federal deposit insurance.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 82,
            "database": "fdic-sdi-data",
            "VarName": "insort",
            "ShortDescription": "Sort Institutions",
            "LongDescription": "The default sort order of an Institution List is by institution name. If an alternative sort order is desired, select one from the drop-down box.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 407,
            "database": "fdic-sdi-data",
            "VarName": "InSort",
            "ShortDescription": "Sort Institutions",
            "LongDescription": "The default sort order of an Institution List is by institution name. If an alternative sort order is desired, select one from the drop-down box.",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 413,
            "database": "fdic-sdi-data",
            "VarName": "inSort",
            "ShortDescription": "Sort Institutions",
            "LongDescription": "The default sort order of an Institution List is by institution name. If an alternative sort order is desired, select one from the drop-down box.",
            "File": "Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 78,
            "database": "fdic-sdi-data",
            "VarName": "instalp",
            "ShortDescription": "State",
            "LongDescription": "Select from a drop-down box.  State in which the the headquarters are physically located. The FDIC Act defines state as any State of the United States, the District of Columbia, and any territory of the United States, Puerto Rico, Guam, American Samoa, the Trust Territory of the Pacific Islands, the Virgin Island, and the Northern Mariana Islands.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 404,
            "database": "fdic-sdi-data",
            "VarName": "InStalp",
            "ShortDescription": "State",
            "LongDescription": "Select from a drop-down box.  State in which the the headquarters are physically located. The FDIC Act defines state as any State of the United States, the District of Columbia, and any territory of the United States, Puerto Rico, Guam, American Samoa, the Trust Territory of the Pacific Islands, the Virgin Island, and the Northern Mariana Islands.",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 411,
            "database": "fdic-sdi-data",
            "VarName": "inStalp",
            "ShortDescription": "State",
            "LongDescription": "Select from a drop-down box.  State in which the the headquarters are physically located. The FDIC Act defines state as any State of the United States, the District of Columbia, and any territory of the United States, Puerto Rico, Guam, American Samoa, the Trust Territory of the Pacific Islands, the Virgin Island, and the Northern Mariana Islands.",
            "File": "Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 128,
            "database": "fdic-sdi-data",
            "VarName": "intan",
            "ShortDescription": "Goodwill and other intangibles",
            "LongDescription": "Intangible assets include goodwill, mortgage servicing rights, purchased credit card relationships and other identifiable intangible assets.",
            "File": "Assets and Liabilities.csv; Goodwill and Other Intangibles.csv",
            "AON": "numeric"
        },
        {
            "V1": 417,
            "database": "fdic-sdi-data",
            "VarName": "intangao",
            "ShortDescription": "All other identifiable intangible assets",
            "LongDescription": "The unamortized amount (book value) of all other specifically identifiable intangible assets such as core deposit intangibles and favorable leasehold rights.    Only filed by TFR Reporters between 1997 and 1998.",
            "File": "Goodwill and Other Intangibles.csv",
            "AON": "numeric"
        },
        {
            "V1": 416,
            "database": "fdic-sdi-data",
            "VarName": "intangcc",
            "ShortDescription": "Purchased credit card relationships and nonmortgage servicing assets",
            "LongDescription": "Purchased credit card relationships represent the right to conduct ongoing credit card business dealings with the cardholders. In general, purchased credit card relationships are an amount paid in excess of the value of the purchased credit card receivables. Such relationships arise when the reporting bank purchases existing credit card receivables and also has the right to provide credit card services to those customers. Purchased credit card relationships may also be acquired when the reporting bank purchases an entire depository institution. Purchased credit card relationships are carried at amortized cost, not in excess of the discounted amount of estimated future net cash flows. Management of the institution reviews the carrying value at least quarterly, adequately documents this review, and adjusts the carrying value as necessary. If unanticipated acceleration or deceleration of cardholder payments, account attrition, changes in fees or finance charges, or other events occur that reduce the amount of expected future net cash flows, a write-down of the book value of the purchased credit card relationships is made to the extent that the discounted amount of estimated future net cash flows is less than the asset's carrying amount. The carrying value of nonmortgage servicing assets is the unamortized cost of acquiring contracts to service financial assets, other than loans secured by real estate, that have been securitized or are owned by another party, net of any related valuation allowances.    For TFR Reporters, includes nonmortgage servicing assets beginning March 1999.",
            "File": "Goodwill and Other Intangibles.csv",
            "AON": "numeric"
        },
        {
            "V1": 414,
            "database": "fdic-sdi-data",
            "VarName": "intangw",
            "ShortDescription": "Goodwill",
            "LongDescription": "The amount (book value) of unamortized goodwill. Goodwill represents the excess of the cost of a company over the sum of the fair values of the tangible and identifiable intangible assets acquired less the fair value of liabilities assumed in a business combination accounted for as a purchase. Goodwill and similar intangible assets ordinarily cannot be disposed of apart from an institution as a whole. Accordingly, a bank may not remove goodwill from its balance sheet by 'selling' or 'dividending' this asset to its parent holding company or another affiliate. An exception to the rule precluding the disposal of goodwill is made when a large segment or separable group of assets of an acquired company or an entire acquired company is sold or otherwise liquidated. In that case, some or all of the unamortized goodwill recognized in the acquisition should be included in the cost of the assets sold. The amount of goodwill reported in this item should not be reduced by any negative goodwill.  Any negative goodwill arising from a business combination accounted for as a purchase is reported in 'Other liabilities.'    Includes &quot;Goodwill and other intangible assets&quot; for TFR Reporters.",
            "File": "Goodwill and Other Intangibles.csv",
            "AON": "numeric"
        },
        {
            "V1": 415,
            "database": "fdic-sdi-data",
            "VarName": "intanmsr",
            "ShortDescription": "Mortgage servicing assets",
            "LongDescription": "All servicing assets resulting from contracts to service loans secured by real estate.",
            "File": "Goodwill and Other Intangibles.csv",
            "AON": "numeric"
        },
        {
            "V1": 834,
            "database": "fdic-sdi-data",
            "VarName": "intexpy",
            "ShortDescription": "Cost of funding earning assets",
            "LongDescription": "Annualized total interest expense on deposits and other borrowed money as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=ernast5'> average earning assets</a> on a consolidated basis.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 436,
            "database": "fdic-sdi-data",
            "VarName": "intinc",
            "ShortDescription": "Total interest income",
            "LongDescription": "Sum of income on loans and leases, plus investment income, interest on interest bearing bank balances, interest on federal funds sold and interest on trading account assets earned by the institution.",
            "File": "Goodwill and Other Intangibles.csv; Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 833,
            "database": "fdic-sdi-data",
            "VarName": "intincy",
            "ShortDescription": "Yield on earning assets",
            "LongDescription": "Total interest income (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=ernast5'> average earning assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 79,
            "database": "fdic-sdi-data",
            "VarName": "inzip",
            "ShortDescription": "Zip Code",
            "LongDescription": "The first five digits of the full postal zip code representing physical location of the institution.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 1031,
            "database": "fdic-sdi-data",
            "VarName": "IOTHII",
            "ShortDescription": "Other interest income",
            "LongDescription": "Report interest and dividend income on assets other than domestic office loans, foreign office loans, lease financing receivables, balances due from depository institutions, securities, trading accounts, and federal funds sold. Include dividend income on ìEquity securities that do not have readily determinable fair valuesî that are reportable in FFIEC Call Schedule RC-F, item 4. Also include interest income on interest-only strips receivable (not in the form of a security) that are reportable in FFIEC Call Schedule RC-F, item 3. prior to 2004, this item is not available for tfr reporters.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 73,
            "database": "fdic-sdi-data",
            "VarName": "iotnii",
            "ShortDescription": "Other non-interest income",
            "LongDescription": "All non interest income of the bank not required to be reported elsewhere, including (but exclusive to): income and fees from the rental of safe deposit boxes;income and fees from the sale of checks, money orders, cashiers' checks, and travelers' checks;Income and fees from the use of the bank's ATMs;Income from performing data processing services for others;Earnings on or other increases in the value of the cash surrender value of bank-owned life insurance policies;Rent and other income from Real Estate Owned.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 993,
            "database": "fdic-sdi-data",
            "VarName": "irakeogh",
            "ShortDescription": "IRAs and Keogh plan accounts",
            "LongDescription": "Individual Retirement Accounts and Keogh Plan Accounts held in domestic offices.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 1028,
            "database": "fdic-sdi-data",
            "VarName": "isc",
            "ShortDescription": "Interest income: Securities",
            "LongDescription": "Total interest and dividend income from U.S. Treasury securities, U.S. government agency and corporation obligations, securities issued by states and political subdivisions, other domestic debt securities, foreign debt securities, and equity securities (including investments in mutual funds). Excludes interest income from securities held in trading accounts.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 66,
            "database": "fdic-sdi-data",
            "VarName": "isecz",
            "ShortDescription": "Net securitization income",
            "LongDescription": "Reported net gains or (losses) on assets sold in securitization transactions. Included are fees, other than servicing fees, earned from the bank's securitization transactions and unrealized losses (and recoveries of unrealized losses) on loans and leases held for sale in securitization transactions. Available beginning in March 2001.     This item is not available for TFR Reporters",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 442,
            "database": "fdic-sdi-data",
            "VarName": "iserchg",
            "ShortDescription": "Service charges on deposit accounts",
            "LongDescription": "Service charges on deposit accounts held in domestic offices.<p>For example fees related to: the maintenance of their deposit accounts with the bank,  failure to maintain specified minimum deposit balances,  the number of checks drawn on and deposits made in their deposit accounts, checks drawn on so-called 'no minimum balance' deposit accounts, withdrawals from non-transaction deposit accounts,  closing of savings accounts before a specified minimum period of time has elapsed, accounts inactive for extended periods of time or which have become dormant, deposits to or withdrawals from deposit accounts through the use of automated teller machines or remote service units, the processing of checks drawn against insufficient funds, so-called 'NSF check charges,' that the bank assesses regardless of whether it decides to pay, return, or hold the check. issuing stop payment orders,  certifying checks, etcÖ. </p><P>As of March 2011,this item is available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 65,
            "database": "fdic-sdi-data",
            "VarName": "iserfee",
            "ShortDescription": "Net servicing fees",
            "LongDescription": "Reported income from servicing real estate mortgages, credit cards, and other financial assets held by others. Including any premiums received in lieu of regular servicing . Available beginning in March 2001.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 449,
            "database": "fdic-sdi-data",
            "VarName": "itax",
            "ShortDescription": "Applicable income taxes",
            "LongDescription": "Applicable federal, state and local, and foreign income taxes.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 1029,
            "database": "fdic-sdi-data",
            "VarName": "itrade",
            "ShortDescription": "Interest income: Trading accounts",
            "LongDescription": "Interest income from assets held in trading accounts.  Excludes savings institutions filing a Thrift Financial Report.",
            "File": "Total Interest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 64,
            "database": "fdic-sdi-data",
            "VarName": "ivencap",
            "ShortDescription": "Venture capital revenue",
            "LongDescription": "Venture capital revenue on a consolidated basis available beginning in March 2001. Reported net gains or (losses) on venture capital activities and any fee income from those activities that is not reported in one of the preceding items on the income statement.     This item is not available for TFR Reporters",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 220,
            "database": "fdic-sdi-data",
            "VarName": "LAG",
            "ShortDescription": "Covered amount of Farm Loans under FDIC loss sharing agreement",
            "LongDescription": "Carrying amount Of loans to finance agricultural production and other loans to farmers that are covered by FDIC loss-sharing agreements. reported separately for call 31 reporters only. call 41 reporters and tfr reporters include these loans in all other covered loans and leases (LOTH).Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 218,
            "database": "fdic-sdi-data",
            "VarName": "LCI",
            "ShortDescription": "C&I Loans - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of commercial and industrial loans that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 219,
            "database": "fdic-sdi-data",
            "VarName": "LCON",
            "ShortDescription": "Consumer Loans - FDIC loss-sharing agreements",
            "LongDescription": "Total carrying amount of loans to individuals for household, family and other personal expenditures that are covered by FDIC loss-sharing agreements.. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 131,
            "database": "fdic-sdi-data",
            "VarName": "liab",
            "ShortDescription": "Total Liabilities",
            "LongDescription": "Deposits and other borrowings, subordinated notes and debentures, limited-life preferred stock and related surplus, trading account liabilities and mortgage indebtedness.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 130,
            "database": "fdic-sdi-data",
            "VarName": "liabeq",
            "ShortDescription": "Total liabilities and capital",
            "LongDescription": "Total liabilities, limited-life preferred stock and equity capital.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 954,
            "database": "fdic-sdi-data",
            "VarName": "liabfor",
            "ShortDescription": "Total liabilities in foreign offices",
            "LongDescription": "Deposits and other borrowings, subordinated notes and debentures, limited-life preferred stock and related surplus, trading account liabilities and mortgage indebtedness which are held in foreign offices.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 313,
            "database": "fdic-sdi-data",
            "VarName": "ListOfOffices",
            "ShortDescription": "Current List of Total Offices",
            "LongDescription": "A branch/office is any location, or facility, of a financial institution, including its main office, where deposit accounts are opened, deposits are accepted, checks paid, and loans granted. Some branches include, but are not limited to, brick and mortar locations, detached or attached drive-in facilities, seasonal offices, offices on military bases or government installations, paying/receiving stations or units, nondeposit offices, Internet and PhoneBanking locations where a customer can open accounts, make deposits and borrow money. A branch does not include Automated Teller Machines (ATM), Consumer Credit Offices, Contractual Offices, Customer Bank Communication Terminals (CBCT), Electronic Fund Transfer Units (EFTU), and Loan Production Offices Summary of Deposits information is required for each insured office located in any State, the District of Columbia, the Commonwealth of Puerto Rico or any U.S. territory or possession such as Guam or the U.S. Virgin Islands, without regard to the location of the main office.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 656,
            "database": "fdic-sdi-data",
            "VarName": "lnag",
            "ShortDescription": "Farm loans",
            "LongDescription": "Loans to finance agricultural production and other loans to farmers.  Excludes savings institutions filing a TFR.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 908,
            "database": "fdic-sdi-data",
            "VarName": "Lnag1",
            "ShortDescription": "$ amt. loans to finance agricultural prod. - orig. amts. of $100K or less",
            "LongDescription": "Amount of currently outstanding loans to finance agricultural production and other loans to farmers with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 924,
            "database": "fdic-sdi-data",
            "VarName": "Lnag1N",
            "ShortDescription": "# of loans to finance agricultural prod. - orig. amts. of $100K or less",
            "LongDescription": "Number of individual loans to finance agricultural production and other loans to farmers with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 909,
            "database": "fdic-sdi-data",
            "VarName": "Lnag2",
            "ShortDescription": "$ amt. loans to finance agricultural prod. - orig. amts. $100K - $250K",
            "LongDescription": "Amount of currently outstanding loans to finance agricultural production and other loans to farmers with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 925,
            "database": "fdic-sdi-data",
            "VarName": "Lnag2N",
            "ShortDescription": "# of loans to finance agricultural prod. - orig. amts. $100K - $250K",
            "LongDescription": "Number of individual loans to finance agricultural production and other loans to farmers with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 910,
            "database": "fdic-sdi-data",
            "VarName": "Lnag3",
            "ShortDescription": "$ amt. loans to finance agricultural prod. - orig. amts. $250K - $500K",
            "LongDescription": "Amount of currently outstanding loans to finance agricultural production and other loans to farmers with original amounts between $250,000 and $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 926,
            "database": "fdic-sdi-data",
            "VarName": "Lnag3N",
            "ShortDescription": "# of loans to finance agricultural prod. - orig. amts. $250K - $500K",
            "LongDescription": "Number of individual loans to finance agricultural production and other loans to farmers with original amounts between $250,000 and $500,000 held in domestic offices.<BR><BR><b>Note:</b><BR>(1) Institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range)<BR>(2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 907,
            "database": "fdic-sdi-data",
            "VarName": "Lnag4",
            "ShortDescription": "$ amt. loans to finance agricultural prod. - orig. amts. of $500K or less",
            "LongDescription": "Amount of currently outstanding loans to finance agricultural production and other loans to farmers with original amounts less than $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 923,
            "database": "fdic-sdi-data",
            "VarName": "Lnag4N",
            "ShortDescription": "# of loans to finance agricultural prod. - orig. amts. of $500K or less",
            "LongDescription": "Number of individual loans to finance agricultural production and other loans to farmers with original amounts less than $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 945,
            "database": "fdic-sdi-data",
            "VarName": "lnagfor",
            "ShortDescription": "Farm loans",
            "LongDescription": "Loans to finance agricultural production and other loans to farmers held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 124,
            "database": "fdic-sdi-data",
            "VarName": "lnatres",
            "ShortDescription": "Loan loss allowance",
            "LongDescription": "Each bank must maintain an allowance (reserve) for loan and lease losses that is adequate to absorb estimated credit losses associated with its loan and lease portfolio (which also includes off-balance-sheet credit instruments).",
            "File": "Assets and Liabilities.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 849,
            "database": "fdic-sdi-data",
            "VarName": "lnatresr",
            "ShortDescription": "Loss allowance to loans",
            "LongDescription": "Allowance for loan and lease losses as a percent of total loan and lease financing receivables, excluding unearned income.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 662,
            "database": "fdic-sdi-data",
            "VarName": "LNAUTO",
            "ShortDescription": "Consumer Loans - Auto",
            "LongDescription": "Automobile loans to individuals for household, family and other personal expenditures on a consolidated basis. prior to march 2011, this item was included in other consumer loans (lnconoth)",
            "File": "Net Loans and Leases.csv",
            "AON": "alpha"
        },
        {
            "V1": 657,
            "database": "fdic-sdi-data",
            "VarName": "lnci",
            "ShortDescription": "Commercial and industrial loans",
            "LongDescription": "Commercial and industrial loans. Excludes all loans secured by real estate, loans to individuals, loans to depository institutions and foreign governments, loans to states and political subdivisions and lease financing receivables.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 900,
            "database": "fdic-sdi-data",
            "VarName": "Lnci1",
            "ShortDescription": "$ amt. C&I loans to U.S. addressees - orig. amts. of $100K or less",
            "LongDescription": "Amount of currently outstanding commercial and industrial loans with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of aforementioned loans with original amounts of less than $100,000, it is assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 916,
            "database": "fdic-sdi-data",
            "VarName": "Lnci1N",
            "ShortDescription": "# of C&I loans to U.S. addressees - orig. amts. of $100K or less",
            "LongDescription": "Number of individual commercial and industrial loans with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 901,
            "database": "fdic-sdi-data",
            "VarName": "Lnci2",
            "ShortDescription": "$ amt. C&I loans to U.S. addressees - orig. amts. $100K - $250K",
            "LongDescription": "Amount of currently outstanding commercial and industrial loans with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 917,
            "database": "fdic-sdi-data",
            "VarName": "Lnci2N",
            "ShortDescription": "# of C&I loans to U.S. addressees - orig. amts. $100K - $250K",
            "LongDescription": "Number of individual commercial and industrial loans with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2)Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 902,
            "database": "fdic-sdi-data",
            "VarName": "Lnci3",
            "ShortDescription": "$ amt. C&I loans to U.S. addressees - orig. amts. $250K - $1M",
            "LongDescription": "Amount of currently outstanding commercial and industrial loans with original amounts $250,000 and $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 918,
            "database": "fdic-sdi-data",
            "VarName": "Lnci3N",
            "ShortDescription": "# of C&I loans to U.S. addressees - orig. amts. $250K - $1M",
            "LongDescription": "Number of individual commercial and industrial loans with original amounts between $250,000 and $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 899,
            "database": "fdic-sdi-data",
            "VarName": "Lnci4",
            "ShortDescription": "$ amt. C&I loans to U.S. addressees - orig. amts.  of $1M or less",
            "LongDescription": "Amount of currently outstanding commercial and industrial loans less than $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of aforementioned loans with original amounts of less than $100,000, it is assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 915,
            "database": "fdic-sdi-data",
            "VarName": "Lnci4N",
            "ShortDescription": "# of C&I loans to U.S. addressees - orig. amts.  of $1M or less",
            "LongDescription": "Number of individual commercial and industrial loans with original amounts less than $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 946,
            "database": "fdic-sdi-data",
            "VarName": "lncifor",
            "ShortDescription": "Commercial and industrial loans",
            "LongDescription": "Commercial and industrial loans held in foreign offices. Excludes all loans secured by real estate, loans to individuals, loans to depository institutions and foreign governments, loans to states and political subdivisions and lease financing receivables.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 658,
            "database": "fdic-sdi-data",
            "VarName": "lncinus",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "All commercial and industrial loans to non-U.S. addressees.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 947,
            "database": "fdic-sdi-data",
            "VarName": "lncinusf",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "Commercial and industrial loans (to non-U.S. addressees) held in foreign offices. Excludes all loans secured by real estate, loans to individuals, loans to depository institutions and foreign governments, loans to states and political subdivisions and lease financing receivables.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 669,
            "database": "fdic-sdi-data",
            "VarName": "lncomre",
            "ShortDescription": "Loans not secured by real estate",
            "LongDescription": "Loans to finance commercial real estate, construction and land development which are not secured by real estate.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 659,
            "database": "fdic-sdi-data",
            "VarName": "lncon",
            "ShortDescription": "Loans to individuals",
            "LongDescription": "Loans to individuals for household, family, and other personal expenditures including outstanding credit card balances and other secured and unsecured consumer loans.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 948,
            "database": "fdic-sdi-data",
            "VarName": "lnconfor",
            "ShortDescription": "Loans to individuals",
            "LongDescription": "Loans to individuals held in foreign offices for household, family, and other personal expenditures including outstanding credit card balances and other secured and unsecured consumer loans.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 663,
            "database": "fdic-sdi-data",
            "VarName": "lnconoth",
            "ShortDescription": "Other loans to individuals",
            "LongDescription": "Other loans to individuals for household, family and other personal expenditures (consumer loans) including single payment, installment and all student loans.Included are loans for such purposes as:(1) purchases of private passenger automobiles, pickup trucks, household appliances,furniture, trailers, and boats;(2) repairs or improvements to the borrower's residence (not secured by real estate);(3) educational expenses, including student loans;(4) medical expenses;(5) personal taxes;(6) vacations;(7) consolidation of personal (nonbusiness) debts;(8) purchases of real estate or mobile homes (not secured by real estate) to be used as aresidence by the borrower's family; and(9) other personal expenditures.<br><br>Note: Beginning March 2011, excludes automobile loans.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 661,
            "database": "fdic-sdi-data",
            "VarName": "lnconrp",
            "ShortDescription": "Related Plans",
            "LongDescription": "All extensions of credit to individuals for household, family, and other personal expenditures arising from prearranged overdraft plans and other revolving credit plans not accessed by credit cards. Prior to 2001, this item is reported in 'Loans to individuals ñ Credit cards'.    This item is not available for TFR Reporters.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 645,
            "database": "fdic-sdi-data",
            "VarName": "lncontra",
            "ShortDescription": "Unearned income",
            "LongDescription": "Loan revenue that has been received in advance of its being earned. for tfr reporters, this item consists of loans in process and unamortized yield adjustments through 1996. After 1996, loans in process and unamortized yield adjustments are netted from loan balances, and not reported in this item.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 660,
            "database": "fdic-sdi-data",
            "VarName": "lncrcd",
            "ShortDescription": "Credit card loans",
            "LongDescription": "Consumer loans extended through credit card plans. Prior to 2001, includes check credit and other revolving credit plans.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 563,
            "database": "fdic-sdi-data",
            "VarName": "lndepac",
            "ShortDescription": "Loans to depository institutions and acceptances of other banks",
            "LongDescription": "All loans (other than those secured by real estate), including overdrafts, to banks, other depositoryinstitutions, and other associations, companies, and financial intermediaries whose primarybusiness is to accept deposits and to extend credit for business or for personal expenditurepurposes.  Also the bankís holdings of all bankers acceptances accepted by other banks thatare not held for trading. Acceptances accepted by other banks may be purchased in the openmarket or discounted by the reporting bank.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 564,
            "database": "fdic-sdi-data",
            "VarName": "lndepcb",
            "ShortDescription": "To commercial banks in U.S.",
            "LongDescription": "Total loans to commercial banks located in the U.S. and acceptances of such banks. Begginning in 2001, this item is not reported by institutions with less than $300 million in total assets.",
            "File": "Loans to Depository Institutions.csv",
            "AON": "numeric"
        },
        {
            "V1": 942,
            "database": "fdic-sdi-data",
            "VarName": "lndepcbf",
            "ShortDescription": "To commercial banks in U.S.",
            "LongDescription": "Total loans to commercial banks located in the U.S. held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 567,
            "database": "fdic-sdi-data",
            "VarName": "lndepfc",
            "ShortDescription": "To banks in foreign countries",
            "LongDescription": "Loans to depository institutions and their branches that are located outside the U.S. and acceptances of such entities. This item is not reported by institutions with less than $300 million in total assets.",
            "File": "Loans to Depository Institutions.csv",
            "AON": "numeric"
        },
        {
            "V1": 944,
            "database": "fdic-sdi-data",
            "VarName": "lndepfcf",
            "ShortDescription": "To banks in foreign countries",
            "LongDescription": "Loans to depository institutions and their branches that are located outside the U.S held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 568,
            "database": "fdic-sdi-data",
            "VarName": "lndepfus",
            "ShortDescription": "To foreign branches of U.S. banks",
            "LongDescription": "Loans to foreign branches of U.S. banks and acceptances of such entities.  This item is not reported by institutions with less than $300 million in total assets.",
            "File": "Loans to Depository Institutions.csv",
            "AON": "numeric"
        },
        {
            "V1": 566,
            "database": "fdic-sdi-data",
            "VarName": "lndepus",
            "ShortDescription": "To other depository institutions in U.S.",
            "LongDescription": "Loans to other depository institutions in the U.S. (other than commercial banks domiciled in the U.S.) and acceptances of such entities.  This item is not reported by institutions with less than $300 million in total assets.",
            "File": "Loans to Depository Institutions.csv",
            "AON": "numeric"
        },
        {
            "V1": 565,
            "database": "fdic-sdi-data",
            "VarName": "lndepusb",
            "ShortDescription": "To U.S. branches and agencies of foreign banks",
            "LongDescription": "Total loans to U.S. branches and agencies of foreign banks and acceptances of such entities.  This item is not reported by institutions with less than $300 million in total assets.",
            "File": "Loans to Depository Institutions.csv",
            "AON": "numeric"
        },
        {
            "V1": 943,
            "database": "fdic-sdi-data",
            "VarName": "lndepusf",
            "ShortDescription": "To other depository institutions in U.S.",
            "LongDescription": "Loans to other depository institutions in the U.S. (other than commercial banks domiciled in the U.S.) held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 162,
            "database": "fdic-sdi-data",
            "VarName": "lnexamt",
            "ShortDescription": "Insider loans",
            "LongDescription": "The aggregate extension of credit at the reporting entity(ies) to all the executive officers, directors, principal shareholders and their related interests.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 665,
            "database": "fdic-sdi-data",
            "VarName": "lnfg",
            "ShortDescription": "Loans to foreign governments and official institutions",
            "LongDescription": "Loans (including planned and unplanned overdrafts) to foreign governments and official institutions, including foreign central banks. >   This item is not available for TFR Reporters.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 949,
            "database": "fdic-sdi-data",
            "VarName": "lnfgfor",
            "ShortDescription": "Loans to foreign governments and official institutions",
            "LongDescription": "Loans (including planned and unplanned overdrafts) to foreign governments and official institutions, including foreign central banks, held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 569,
            "database": "fdic-sdi-data",
            "VarName": "lnls",
            "ShortDescription": "Loans and leases, gross",
            "LongDescription": "Loans and lease financing receivables of the institution, including unearned income.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 853,
            "database": "fdic-sdi-data",
            "VarName": "lnlsdepr",
            "ShortDescription": "Net loans and leases to deposits",
            "LongDescription": "Loans and lease financing receivables net of unearned income, allowances and reserves as a percent of total deposits.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 940,
            "database": "fdic-sdi-data",
            "VarName": "lnlsfor",
            "ShortDescription": "Loans and leases, gross",
            "LongDescription": "Loans and lease financing receivables of the institution, including unearned income, held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 644,
            "database": "fdic-sdi-data",
            "VarName": "lnlsgr",
            "ShortDescription": "Total loans and leases",
            "LongDescription": "Total loans and lease financing receivables, net of unearned income.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 862,
            "database": "fdic-sdi-data",
            "VarName": "LNLSGR5",
            "ShortDescription": "Average total loans",
            "LongDescription": "The average of total loans and lease financing receivables, net of unearned income. Averages are calculated as follows: Year-to-date averages: March reporting period - (December total loans + March total loans) / 2 June reporting period - (December total loans + March total loans + June total loans) / 3 September reporting period - (December total loans + March total loans + June total loans + September total loans) / 4 December reporting period - (Previous December total loans + March total loans + June total loans + September total loans + December total loans) / 5 Quarterly averages: All reporting periods ñ (Previous quarter total loans + current quarter total loans) / 2",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 674,
            "database": "fdic-sdi-data",
            "VarName": "lnlsgrf",
            "ShortDescription": "Total loans and leases",
            "LongDescription": "Total loans and lease financing receivables, net of unearned income, held in foreign offices. This item is filed by  Call Reporters  only.",
            "File": "Net Loans and Leases.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 123,
            "database": "fdic-sdi-data",
            "VarName": "lnlsnet",
            "ShortDescription": "Net loans and leases",
            "LongDescription": "Total loans and lease financing receivables minus unearned income and loan loss allowances.",
            "File": "Assets and Liabilities.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 852,
            "database": "fdic-sdi-data",
            "VarName": "LNLSNTV",
            "ShortDescription": "Net loans and leases to total assets",
            "LongDescription": "Loan and lease financing receivables, net of unearnedincome, allowances, and reserves, as a percent of totalassets.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "alpha"
        },
        {
            "V1": 164,
            "database": "fdic-sdi-data",
            "VarName": "lnlssale",
            "ShortDescription": "Loans and leases held for sale",
            "LongDescription": "Loans and leases held for sale, a memoranda item only beginning in March 2001. The amount is included in total Loans and leases. This item is not filed by TFR Reporters.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 666,
            "database": "fdic-sdi-data",
            "VarName": "lnmuni",
            "ShortDescription": "Obligations of states and political subdivisions in U.S.",
            "LongDescription": "Obligations of states and political subdivisions in the U.S. including nonrated industrial development obligations.  Securities and leases are not included. >   This item is not available for TFR Reporters.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 950,
            "database": "fdic-sdi-data",
            "VarName": "lnmunif",
            "ShortDescription": "Obligations of states and political subdivisions in U.S.",
            "LongDescription": "Obligations of states and political subdivisions in the U.S. (including nonrated industrial development obligations) held in foreign offices.  Securities and leases are not included.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 578,
            "database": "fdic-sdi-data",
            "VarName": "lnot1t3",
            "ShortDescription": "Over one year through three years",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of over one year through three years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 576,
            "database": "fdic-sdi-data",
            "VarName": "lnot3les",
            "ShortDescription": "Three months or less",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of three months or less.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 577,
            "database": "fdic-sdi-data",
            "VarName": "lnot3t12",
            "ShortDescription": "Over three months through twelve months",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of over three months through twelve months.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 579,
            "database": "fdic-sdi-data",
            "VarName": "lnot3t5",
            "ShortDescription": "Over three years through five years",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of over three years through five years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 580,
            "database": "fdic-sdi-data",
            "VarName": "lnot5t15",
            "ShortDescription": "Over five years through fifteen years",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of over five years through fifteen years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 664,
            "database": "fdic-sdi-data",
            "VarName": "lnotci",
            "ShortDescription": "All other loans & leases",
            "LongDescription": "Includes obligations (other than securities and leases) of U.S. states and political subdivisions including nonrated industrial development obligations, total acceptances of other banks, loans to depository institutions and foreign governments and lease financing receivables.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 951,
            "database": "fdic-sdi-data",
            "VarName": "lnotherf",
            "ShortDescription": "Other loans",
            "LongDescription": "All other loans held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 581,
            "database": "fdic-sdi-data",
            "VarName": "lnotov15",
            "ShortDescription": "Over fifteen years",
            "LongDescription": "All other loans and leases (other than closed-end loans secured by first lien on 1-4 family residential properties) with a remaining maturity or next repricing date of over fifteen years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 647,
            "database": "fdic-sdi-data",
            "VarName": "lnre",
            "ShortDescription": "All real estate loans",
            "LongDescription": "Loans secured primarily by real estate, whether originated by the bank or purchased.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 654,
            "database": "fdic-sdi-data",
            "VarName": "lnreag",
            "ShortDescription": "Farmland loans",
            "LongDescription": "Loans secured by farmland held in domestic offices.  Excludes savings institutions filing a TFR.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 904,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag1",
            "ShortDescription": "$ amt. loans sec. by farmland  -  orig. amts. of $100K or less",
            "LongDescription": "Amount of currently outstanding loans secured by farmland (including farm residential and other improvements) with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 920,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag1N",
            "ShortDescription": "# of loans sec. by farmland  -  orig. amts. of $100K or less",
            "LongDescription": "Number of individual loans secured by farmland (including farm residential and other improvements) with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 905,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag2",
            "ShortDescription": "$ amt. loans sec. by farmland  -  orig. amts. $100K - $250K",
            "LongDescription": "Amount of currently outstanding loans secured by farmland (including farm residential and other improvements) with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 921,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag2N",
            "ShortDescription": "# of loans sec. by farmland  -  orig. amts. $100K - $250K",
            "LongDescription": "Number of individual loans secured by farmland (including farm residential and other improvements) with original amounts between $100,000 and $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 906,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag3",
            "ShortDescription": "$ amt. loans sec. by farmland  -  orig. amts. $250K - $500K",
            "LongDescription": "Amount of currently outstanding loans secured by farmland (including farm residential and other improvements) with original amounts between $250,000 and $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 922,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag3N",
            "ShortDescription": "# of loans sec. by farmland  -  orig. amts. $250K - $500K",
            "LongDescription": "Number of individual loans secured by farmland (including farm residential and other improvements) with original amounts between $250,000 and $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 903,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag4",
            "ShortDescription": "$ amt. loans sec. by farmland  -  orig. amts. of $500K or less",
            "LongDescription": "Amount of currently outstanding loans secured by farmland (including farm residential and other improvements) with original amounts less than $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 919,
            "database": "fdic-sdi-data",
            "VarName": "Lnreag4N",
            "ShortDescription": "# of loans sec. by farmland  -  orig. amts. of $500K or less",
            "LongDescription": "Number of individual loans secured by farmland (including farm residential and other improvements) with original amounts less than $500,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $500,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 671,
            "database": "fdic-sdi-data",
            "VarName": "LNRECNFM",
            "ShortDescription": "Residential 1-4 family construction",
            "LongDescription": "Residential 1-4 family construction loans secured by real estate in domestic offices.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 672,
            "database": "fdic-sdi-data",
            "VarName": "LNRECNOT",
            "ShortDescription": "Other construction, all land development and other land",
            "LongDescription": "Other construction loans and all land development and other land loans secured by real estate in domestic offices.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 649,
            "database": "fdic-sdi-data",
            "VarName": "lnrecons",
            "ShortDescription": "Construction and development loans",
            "LongDescription": "Construction and land development loans secured by real estate held in domestic offices. This item includes loans for all property types under construction, as well as loans for land acquisition and development.",
            "File": "Memoranda.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 648,
            "database": "fdic-sdi-data",
            "VarName": "lnredom",
            "ShortDescription": "Real estate loans in domestic offices",
            "LongDescription": "Loans in domestic offices secured primarily by real estate (whether originated by the bank or purchased) as evidenced by mortgages, deeds of trust, land contracts, or other instruments.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 655,
            "database": "fdic-sdi-data",
            "VarName": "lnrefor",
            "ShortDescription": "Loans held in foreign offices",
            "LongDescription": "Loans secured by Real Estate held in foreign offices.",
            "File": "Memoranda.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 55,
            "database": "fdic-sdi-data",
            "VarName": "lnreloc",
            "ShortDescription": "Home equity loans",
            "LongDescription": "Open-end loans secured by 1-4 family residential properties extended as lines of credit in domestic offices (included in total 1-4 mortgage loans).",
            "File": "1-4 Family Residential Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 653,
            "database": "fdic-sdi-data",
            "VarName": "lnremult",
            "ShortDescription": "Multifamily residential real estate",
            "LongDescription": "Multifamily (5 or more) residential property loans secured by real estate held in domestic offices.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 896,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr1",
            "ShortDescription": "$ amt. loans sec. by nonfarm nonres. props. - orig. amts. of $100K or less",
            "LongDescription": "Amount of currently outstanding loans secured by nonfarm nonresidential properties with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 912,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr1N",
            "ShortDescription": "# of loans sec. by nonfarm nonres. props. - orig. amts. of $100K or less",
            "LongDescription": "Number of individual loans secured by nonfarm nonresidential properties with original amounts of $100,000 or less held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 897,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr2",
            "ShortDescription": "$ amt. loans sec. by nonfarm nonres. props. - orig. amts. $100K- $250K",
            "LongDescription": "Amount of currently outstanding loans secured by nonfarm nonresidential properties with original amounts of more than $100,000 through $250,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 913,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr2N",
            "ShortDescription": "# of loans sec. by nonfarm nonres. props. - orig. amts. $100K- $250K",
            "LongDescription": "Number of individual small business loans secured by nonfarm nonresidential properties in domestic offices with original amounts of more than $100,000 through $250,000. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 898,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr3",
            "ShortDescription": "$ amt. loans sec. by nonfarm nonres. props. - orig. amts. $250K - $1M",
            "LongDescription": "Amount of currently outstanding loans secured by nonfarm nonresidential properties with original amounts between $250,000 and $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 914,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr3N",
            "ShortDescription": "# of loans sec. by nonfarm nonres. props. - orig. amts. $250K - $1M",
            "LongDescription": "Number of individual loans secured by nonfarm nonresidential properties with original amounts between $250,000 and $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 895,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr4",
            "ShortDescription": "$ amt. loans sec. by nonfarm nonres. props. - orig. amts. of $1M or less",
            "LongDescription": "Amount of currently outstanding loans secured by nonfarm nonresidential properties with original amounts less than $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3) Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 911,
            "database": "fdic-sdi-data",
            "VarName": "Lnrenr4N",
            "ShortDescription": "# of loans sec. by nonfarm nonres. props. - orig. amts. of $1M or less",
            "LongDescription": "Number of individual loans secured by nonfarm nonresidential properties with original amounts less than $1,000,000 held in domestic offices. note: (1) institutions report only those loans having original amounts of less than $1,000,000 (large institutions might have these types of loans but not within this size range) (2) For institutions filing only the total number of the aforementioned loans with original amounts of less than $100,000, it was assumed that the total amount of these loans have original amounts of less than $100,000 (3)Available on a quarterly basis as of 2010. Prior to 2010, reported as of June 30th only.",
            "File": "Small Business Loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 650,
            "database": "fdic-sdi-data",
            "VarName": "lnrenres",
            "ShortDescription": "Commercial RE",
            "LongDescription": "Nonresidential loans (excluding farm loans) primarily secured by real estate held in domestic offices.     Please note: Thrift Financial Reporters include mortgages on properties that are used for farming in this item.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 652,
            "database": "fdic-sdi-data",
            "VarName": "LNRENROT",
            "ShortDescription": "Commercial real estate other  non-farm non-residential",
            "LongDescription": "The amount of nonfarm nonresidential real estate loans that are not secured by owner-occupied nonfarm nonresidential properties.  Loans secured by other nonfarm nonresidential properties are those nonfarm nonresidential property loans where the primary source of repayment is derived from rental income associated with the property (i.e., loans for which 50 percent or more of the source of repayment comes from third party, nonaffiliated, rental income) or the proceeds of the sale, refinancing, or permanent financing of the property. Included are loans secured by hotels, motels, dormitories, nursing homes, assisted-living facilities, mini-storage warehouse facilities, and similar properties in this item as loans secured by other nonfarm nonresidential properties. Note: Available as of March 2007",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 651,
            "database": "fdic-sdi-data",
            "VarName": "LNRENROW",
            "ShortDescription": "Commercial real estate owner-occupied",
            "LongDescription": "Loans secured by owner-occupied nonfarm nonresidential properties in domestic offices. loans secured by owner-occupied nonfarm nonresidential properties are those nonfarm nonresidential property loans for which the primary source of repayment is the cash flow from the ongoing operations and activities conducted by the party, or an affiliate of the party, who owns the property. Thus, for loans secured by owner-occupied nonfarm nonresidential properties, the primary source of repayment is not derived from third party, nonaffiliated, rental income associated with the property (i.e., any such rental income is less than 50 percent of the source of repayment) or the proceeds of the sale, refinancing, or permanent financing of the property. Include loans secured by hospitals, golf courses, recreational facilities, and car washes unless the property is owned by an investor who leases the property to the operator who, in turn, is not related to or affiliated with the investor. Also include loans secured by churches unless the property is owned by an investor who leases the property to the congregation. Note: 1) Prior to March 2008, listed as a memoranda item for Call report filers that met specific criteria. 2) Considered confidential for TFR filers.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 670,
            "database": "fdic-sdi-data",
            "VarName": "lnrenus",
            "ShortDescription": "Loans secured by real estate to non-U.S. addressees",
            "LongDescription": "Loans secured by real estate to non-U.S. addressees",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 52,
            "database": "fdic-sdi-data",
            "VarName": "lnreres",
            "ShortDescription": "1-4 family residential loans",
            "LongDescription": "Total loans secured by 1-4 family residential properties (including revolving and open-end loans) held in domestic offices.<br>Note:Prior to 2004 the savings institutions that file a thrift financial report did not report the 1-4 family loans by the sub category first liens and second liens. The data is not available prior to this year.  Commercial banks began reporting that data in 1991",
            "File": "1-4 Family Residential Net Loans and Leases.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 56,
            "database": "fdic-sdi-data",
            "VarName": "LNRERSF1",
            "ShortDescription": "Adjustable rate loans secured by 1-4 family residential (memoranda)",
            "LongDescription": "All other adjustable rate closed-end loans secured by 1-4family residential properties, secured by first liens, andheld in domestic offices Listed as memoranda only and is included in real estate 1-4 family-first liens. <br><p>This item is not available for <a href='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'>TFR Reporters</a>.",
            "File": "1-4 Family Residential Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 54,
            "database": "fdic-sdi-data",
            "VarName": "LNRERSF2",
            "ShortDescription": "Loans secured by 1-4 family junior liens",
            "LongDescription": "Closed-end loans secured by junior liens on 1-4 family residential properties and held in domestic offices.<br><br>Note: Prior to 2004 the savings institutions that file a thrift financial report did not report the 1-4 family loans by the sub category first liens and second liens. The data is not available prior to this year.  Commercial banks began reporting that data in 1991.",
            "File": "1-4 Family Residential Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 53,
            "database": "fdic-sdi-data",
            "VarName": "LNRERSFM",
            "ShortDescription": "Loans secured by 1-4 family first liens",
            "LongDescription": "Closed-end loans secured by first liens on 1-4 family residential properties and held in domestic offices.<br><br>Note:Prior to 2004 the savings institutions that file a thrift financial report did not report the 1-4 family loans by the sub category first liens and second liens. The data is not available prior to this year.  Commercial banks began reporting that data in 1991.",
            "File": "1-4 Family Residential Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 850,
            "database": "fdic-sdi-data",
            "VarName": "lnresncr",
            "ShortDescription": "Loan loss allowance to noncurrent loans",
            "LongDescription": "Allowance for loan and lease losses as a percent of noncurrent loans and leases.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 572,
            "database": "fdic-sdi-data",
            "VarName": "lnrs1t3",
            "ShortDescription": "Over one year through three years",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or next repricing date of over one year through three years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 570,
            "database": "fdic-sdi-data",
            "VarName": "lnrs3les",
            "ShortDescription": "Three months or less",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or next repricing date of three months or less.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 571,
            "database": "fdic-sdi-data",
            "VarName": "lnrs3t12",
            "ShortDescription": "Over three months through twelve months",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or next repricing date of over three months through twelve months.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 573,
            "database": "fdic-sdi-data",
            "VarName": "lnrs3t5",
            "ShortDescription": "Over three years through five years",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or next repricing date of over three years through five years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 574,
            "database": "fdic-sdi-data",
            "VarName": "lnrs5t15",
            "ShortDescription": "Over five years through fifteen years",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or repricing frequency of over five years through fifteen years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 575,
            "database": "fdic-sdi-data",
            "VarName": "lnrsov15",
            "ShortDescription": "Over fifteen years",
            "LongDescription": "Fixed and floating rate closed-end loans secured by first lien on 1-4 family residential properties held in domestic offices with a remaining maturity or next repricing date of over fifteen years.",
            "File": "Maturity & Repricing for Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 617,
            "database": "fdic-sdi-data",
            "VarName": "LNSB",
            "ShortDescription": "Outstanding principal balance of obligations transferred",
            "LongDescription": "Amount of small business obligations transferred with recourse under Section 208 of the Riegle Act of 1994.  This figure reflects the outstanding principal balance of loans as of the report date.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 618,
            "database": "fdic-sdi-data",
            "VarName": "LNSBR",
            "ShortDescription": "Amount of retained recourse exposure",
            "LongDescription": "Risk retention associated with the sale of small business obligations with recourse under Section 208 of the Riegle Act of 1994.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 621,
            "database": "fdic-sdi-data",
            "VarName": "LNSERV",
            "ShortDescription": "Outstanding Princiapl Balance of Assets Serviced for Others Other Fin. Assets",
            "LongDescription": "Other Financial AssetsOutstanding Principal Balance Of Loans Other Than 1-4 FamilyResidential Mortgage Loans That Are Serviced For Other.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 464,
            "database": "fdic-sdi-data",
            "VarName": "loccom",
            "ShortDescription": "Commercial and similar letters of credit",
            "LongDescription": "The amount of outstanding and unused commercial and similar letters of credit.  Issued or confirmed commercial letters of credit, non-monetary travelers' letters of credit and similar non-standby letters of credit are issued specifically to facilitate trade or commerce.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 458,
            "database": "fdic-sdi-data",
            "VarName": "locfpsb",
            "ShortDescription": "Financial and performance standby letters of credit & foreign office guarantees",
            "LongDescription": "The amount of outstanding and unused financial standby letters of credit, foreign office guarantees, performance standby letters of credit, and foreign office guarantees (including cash collateral standby letters of credit).",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 459,
            "database": "fdic-sdi-data",
            "VarName": "locfpsbk",
            "ShortDescription": "Amount conveyed to others",
            "LongDescription": "That portion of financial standby letters of credit, foreign office guarantees, performance standby letters of credit, and foreign office guarantees (including cash collateral standby letters of credit) conveyed to others.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 460,
            "database": "fdic-sdi-data",
            "VarName": "locfsb",
            "ShortDescription": "Financial standby letters of credit & foreign office guarantees",
            "LongDescription": "The amount of outstanding and unused financial standby letters of credit and foreign office guarantees.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 461,
            "database": "fdic-sdi-data",
            "VarName": "locfsbk",
            "ShortDescription": "Amount conveyed to others",
            "LongDescription": "That portion of financial standby letters of credit and foreign office guarantees conveyed to others.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 462,
            "database": "fdic-sdi-data",
            "VarName": "locpsb",
            "ShortDescription": "Performance standby letters of credit",
            "LongDescription": "The amount of outstanding and unused performance standby letters of credit.  A performance standby letter of credit irrevocably obligates the financial institution to pay a third party beneficiary when a customer fails to perform some contractual nonfinancial obligation.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 463,
            "database": "fdic-sdi-data",
            "VarName": "locpsbk",
            "ShortDescription": "Amount conveyed to others",
            "LongDescription": "That portion of performance standby letters of credit and foreign office guarantees conveyed to others.",
            "File": "Letters of Credit.csv",
            "AON": "numeric"
        },
        {
            "V1": 223,
            "database": "fdic-sdi-data",
            "VarName": "LOREGTY",
            "ShortDescription": "ORE Protected amount - FDIC loss-sharing agreements",
            "LongDescription": "Maximum amount recoverable of other real estate owned (ore) - protected portion of covered other real estate owned included in all the categories of ore ( CALL schedule RC-M 13b1 through 6) that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 221,
            "database": "fdic-sdi-data",
            "VarName": "LOTH",
            "ShortDescription": "All Other Ln & Ls - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of all other loans and leases that are covered by FDIC loss-sharing agreements. Note: This item includes obligations (other than securities leases) of states and political subdivisions in the U.S. and loans to nondepository financial institutions. For TFR and form 041 filers, this item also includes loans to finance agricultural production and other loans farmers. . available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 214,
            "database": "fdic-sdi-data",
            "VarName": "LREAG",
            "ShortDescription": "Re Farmland Loans - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of loans secured by farmland in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 213,
            "database": "fdic-sdi-data",
            "VarName": "LRECONS",
            "ShortDescription": "Re construction Loan - FDIC loss-sharing agreements",
            "LongDescription": "Total carrying amount of construction, land development and other land loans secured by real estate in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 216,
            "database": "fdic-sdi-data",
            "VarName": "LREMULT",
            "ShortDescription": "RE Multifamily Loans-FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of multifamily (5 or more) residential properties held in domestic offices that are covered by FDIC loss-sharing agreements.<br><br> Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 217,
            "database": "fdic-sdi-data",
            "VarName": "LRENRES",
            "ShortDescription": "RE Nonfarm Nonresidential Loans - FDIC loss-sharing agreements",
            "LongDescription": "Total carrying amount of loans secured by nonfarm nonresidential properties in domestic offices that are covered by FDIC loss-sharing agreements.<br><br> Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 215,
            "database": "fdic-sdi-data",
            "VarName": "LRERES",
            "ShortDescription": "RE 1-4 Family Loans - FDIC loss-sharing agreements",
            "LongDescription": "Total carrying amount of loans secured by 1-4 family residential properties in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 668,
            "database": "fdic-sdi-data",
            "VarName": "ls",
            "ShortDescription": "Lease financing receivables",
            "LongDescription": "Lease financing receivables, net of unearned income.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 212,
            "database": "fdic-sdi-data",
            "VarName": "LSALNLS",
            "ShortDescription": "Carry amount for loans and leases covered by loss share agreements",
            "LongDescription": "The carrying amount of the loans and leases covered by FDIC loss-sharing agreements. <br><br>Available as of March 2010.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "numeric"
        },
        {
            "V1": 225,
            "database": "fdic-sdi-data",
            "VarName": "LSAOA",
            "ShortDescription": "Carry amount for other assets covered by loss share agreements",
            "LongDescription": "The carrying amount of other assets covered by FDIC loss-sharing agreements.<br><br> Available as of March 2010.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "numeric"
        },
        {
            "V1": 222,
            "database": "fdic-sdi-data",
            "VarName": "LSAORE",
            "ShortDescription": "Carry amount for ORE covered by loss share agreements",
            "LongDescription": "The carrying amount of Other Real Estate Owned covered by FDIC loss-sharing agreements. <br><br>Available as of March 2010.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "numeric"
        },
        {
            "V1": 224,
            "database": "fdic-sdi-data",
            "VarName": "LSASCDBT",
            "ShortDescription": "Carry amount for dept securities covered by loss share agreements",
            "LongDescription": "The carrying amount of debt securities covered by FDIC loss-sharing agreements. <br><Br>Available as of March 2010.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "numeric"
        },
        {
            "V1": 952,
            "database": "fdic-sdi-data",
            "VarName": "lsfor",
            "ShortDescription": "Lease financing receivables",
            "LongDescription": "Lease financing receivables, net of unearned income, held in foreign offices.",
            "File": "Small Business Loans.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 94,
            "database": "fdic-sdi-data",
            "VarName": "MSA",
            "ShortDescription": "Metropolitan Statistical Area (MSA)",
            "LongDescription": "The Metropolitan Statistical Areas based on Census Bureau data, as defined by the US Office of Management (OMB) before the year 2000. no longer the most current census bureau grouping.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 316,
            "database": "fdic-sdi-data",
            "VarName": "msa",
            "ShortDescription": "Metropolitan Statistical Area (MSA)",
            "LongDescription": "The Metropolitan Statistical Areas based on Census Bureau data, as defined by the US Office of Management (OMB) before the year 2000. no longer the most current census bureau grouping.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 619,
            "database": "fdic-sdi-data",
            "VarName": "MSRECE",
            "ShortDescription": "Outstanding Princiapl Balance of Assets Serviced for Others 1-4 Family Res. Mrtg",
            "LongDescription": "1-4 Family Residential Mortgages Serviced With RecourseOr Other Servicer-Provided Credit Enhancements.  Outstanding Principal Balance Of Assets Serviced For Others 1-4 Family Residential Mortgages Serviced With Recourse Or Other Servicer-Provided Credit Enhancements.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 620,
            "database": "fdic-sdi-data",
            "VarName": "MSRNRECE",
            "ShortDescription": "Outstanding Princiapl Balance of Assets Serviced for Others 1-4 Family Res. Mrtg",
            "LongDescription": "1-4 Family Residential Mortgages Serviced With No RecourseOr Other Servicer-Provided Credit Enhancements.Outstanding Principal Balance Of Assets Serviced For Others1-4 Family Residential Mortgages Serviced With No RecourseOr Other Servicer-Provided Credit Enhancements.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 321,
            "database": "fdic-sdi-data",
            "VarName": "mutual",
            "ShortDescription": "Mutual Ownership Flag",
            "LongDescription": "Banking institutions fall into one of two ownership types, stock or non-stock. <br><br> A non-stock institution, or mutual institution, is owned and controlled solely by its depositors. A mutual does not issue capital stock. (1=Yes, a mutual)  <br><br>An institution which sells stock to raise capital is called a stock institution. It is owned by the shareholders who benefit from profits earned by the institution. (0=No, not a mutual.)",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 809,
            "database": "fdic-sdi-data",
            "VarName": "naag",
            "ShortDescription": "Loans for agriculture and other loans to farmers in nonaccrual status",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers that are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 820,
            "database": "fdic-sdi-data",
            "VarName": "naagsm",
            "ShortDescription": "Loans to finance agriculture and other loans to farmers in nonaccrual status",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers that are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 796,
            "database": "fdic-sdi-data",
            "VarName": "naasset",
            "ShortDescription": "Assets in nonaccrual status",
            "LongDescription": "Total assets, which are no longer accruing interest. Total assets include real estate loans, installment loans, credit cards and related loans, commercial and all other loans, lease financing receivables, debt securities and other assets.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 814,
            "database": "fdic-sdi-data",
            "VarName": "NAAUTO",
            "ShortDescription": "Nonaccrual Auto Loans",
            "LongDescription": "Nonaccrual automobile loans to individuals for household, family and other personal expenditures. br> available as of march 2011",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 810,
            "database": "fdic-sdi-data",
            "VarName": "naci",
            "ShortDescription": "Commercial and industrial loans in nonaccrual status",
            "LongDescription": "Total commercial and industrial loans that in nonaccrual status and are no longer accruing interest.  Institutions with assets of less than $300 million include all other loans in this item.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 811,
            "database": "fdic-sdi-data",
            "VarName": "nacinus",
            "ShortDescription": "Loans to non-U.S. addressees in nonaccrual status",
            "LongDescription": "Total construction and land development loans secured by real estate (with non-U.S. addressees) which are no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 812,
            "database": "fdic-sdi-data",
            "VarName": "nacon",
            "ShortDescription": "Loans to individuals in nonaccrual status",
            "LongDescription": "Total loans to individuals for household, family, and other personal expenditures that in nonaccrual status and are no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 815,
            "database": "fdic-sdi-data",
            "VarName": "NACONOTH",
            "ShortDescription": "Nonaccrual-Other Consumer",
            "LongDescription": "Nonaccrual other loans to individuals for household, family and other personal expenditures on a consolidated basis. beginning march 2001, includes revolving credit plans other than credit cards. beginning march 2011, excludes automobile loans.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 813,
            "database": "fdic-sdi-data",
            "VarName": "nacrcd",
            "ShortDescription": "Credit cards and related plans in nonaccrual status",
            "LongDescription": "Total credit cards loans to individuals that are in nonaccrual status and no longer accruing interest. Prior to 2001, included revolving credit plans other than credit cards.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 807,
            "database": "fdic-sdi-data",
            "VarName": "nadep",
            "ShortDescription": "Loans to depository institutions in nonaccrual status",
            "LongDescription": "Total loans to depository institutions and acceptances of other banks, which are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 808,
            "database": "fdic-sdi-data",
            "VarName": "nadepnus",
            "ShortDescription": "Loans to foreign banks in nonaccrual status",
            "LongDescription": "Total loans to foreign depository institutions and acceptances of other foreign banks that are in nonaccrual status and no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 816,
            "database": "fdic-sdi-data",
            "VarName": "nafg",
            "ShortDescription": "Loans to foreign governments and official institutions in nonaccrual status",
            "LongDescription": "Total loans to foreign governments and official institutions that are no longer accruing interest.   This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 827,
            "database": "fdic-sdi-data",
            "VarName": "NAGTY",
            "ShortDescription": "Nonaccrual Loans and leases, wholly or partially guaranteed by the US Government",
            "LongDescription": "The maximum amount recoverable from the U.S. Government  loans and leases (excluding GNMA loans) that are guaranteed by the U.S. Government and are in nonaccrual status. The U.S. Government includes its agencies and its government-sponsored agencies, under the guarantee or insurance provisions applicable to the loans and leases. Listed here as memoranda only and is included in nonaccrual total assets. FRB Number:  RFCD5617 RCON5617 <br><br>Note: Prior to March 2011, included loans and leases coveredby FDIC loss-sharing agreements. Prior to June 2005, included rebooked GNMA loans.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 828,
            "database": "fdic-sdi-data",
            "VarName": "NAGTYGNM",
            "ShortDescription": "Nonaccrual rebooked GNMA loans",
            "LongDescription": "Nonaccrual rebooked GNMA loans that have been repurchased or are eligible for repurchase by seller-servicers of GNMA loans; and nonaccrual loans that have been purchased out of GNMA securitizations by servicers of GNMA loans that were not the transferors of the loans.  GNMA loans are guaranteed by the Government National Mortgage Association commonly known as Ginnie Mae.  Included in nonaccrual total assets.  FRB Number:  RCFDC868 or RECONC868 <br><br>Note: Prior to March 2011, included loans and leasescovered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 822,
            "database": "fdic-sdi-data",
            "VarName": "NAGTYPAR",
            "ShortDescription": "Guaranteed portion of nonaccrual loans and leases, excluding GNMA loans",
            "LongDescription": "Loans and leases  for which repayment of principal is wholly or partially guaranteed or insured by the U.S. Government, including its agencies and its government-sponsored agencies, that are in nonaccrual status a consolidated basis. Examples include loans guaranteed by the Small Business Administration, and the Federal Housing Administration. Excludes loans and leases guaranteed or insured by state or local governments, state or local government agencies, foreign (non-U.S.) governments, and private agencies or organizations. Also excluded are loans and leases collateralized by securities issued by the U.S. Government, including its agencies and its government-sponsored agencies. Note: Included in nonaccrual total assets. FRB Number:  RFCD5614 RCON5614<br><br>Note: Prior to March 2011, included loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Assets.csv; Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 256,
            "database": "fdic-sdi-data",
            "VarName": "NALAG",
            "ShortDescription": "Nonaccrual Farm loans - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of Nonaccrual loans to finance agricultural production and other loans to farmers that are covered by FDIC loss-sharing agreements. reported separately for call 31 reporters only. call 41 reporters and tfr reporters include these loans in nonaccrual all other covered loans and leases days (NALOTH).Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 254,
            "database": "fdic-sdi-data",
            "VarName": "NALCI",
            "ShortDescription": "Nonaccrual C&I Loans ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Nonaccrual commercial and industrial loans that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 255,
            "database": "fdic-sdi-data",
            "VarName": "NALCON",
            "ShortDescription": "Nonaccrual Consumer Loans  - FDIC Loss Sharing Agreements",
            "LongDescription": "Total nonaccrual consumer loans to individuals for household, family and other personal expenditures that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 258,
            "database": "fdic-sdi-data",
            "VarName": "NALGTY",
            "ShortDescription": "Nonaccrual protected portion (GTY)- FDIC loss sharing agreements",
            "LongDescription": "The maximum amount recoverable from the FDIC under loss-sharing agreements, or total protected portion, covering the nonaccrual loans and leases. Is reported above and beyond the amount that has already been reflected in the measurement of the reporting bankís indemnification asset, which represents the right to receive payments from the FDIC under the loss-sharing agreement.<br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 821,
            "database": "fdic-sdi-data",
            "VarName": "NALNSALE",
            "ShortDescription": "Nonaccrual Loans held for sale in nonaccrual status",
            "LongDescription": "Loans and leases held for sale that are past due and no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 257,
            "database": "fdic-sdi-data",
            "VarName": "NALOTH",
            "ShortDescription": "Nonaccrual Other Loans ñ FDIC  Loss Sharing Agreements",
            "LongDescription": "Nonaccrual all other loans and all leases that are covered by FDIC loss-sharing agreements.<br><br>For TFR and CALL Form 041 filers, this item also includes loans to finance agricultural production and other loans farmers. <br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 250,
            "database": "fdic-sdi-data",
            "VarName": "NALREAG",
            "ShortDescription": "Nonaccrual RE Farm Loans -  FDIC Loss Sharing Agreements",
            "LongDescription": "Nonaccrual farmland loans secured by real estate in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 249,
            "database": "fdic-sdi-data",
            "VarName": "NALRECON",
            "ShortDescription": "Nonaccrual Construction Land Development Loss-Sharing Agreements",
            "LongDescription": "Total nonaccrual construction, land development and other land loans secured by real estate in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 252,
            "database": "fdic-sdi-data",
            "VarName": "NALREMUL",
            "ShortDescription": "Nonaccrual Multifamily Loans ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Nonaccrual multifamily (5 or more) residential property loans secured by real estate in domestic offices that are covered by FDIC loss-sharing agreements.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 253,
            "database": "fdic-sdi-data",
            "VarName": "NALRENRS",
            "ShortDescription": "Nonfarm Nonresidential Properties Loans ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Total nonaccrual loans secured by nonfarm nonresidential properties in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 251,
            "database": "fdic-sdi-data",
            "VarName": "NALRERES",
            "ShortDescription": "Nonaccrual 1-4 Family Loans ñ FDIC Loss Sharing Agreement",
            "LongDescription": "Total nonaccrual loans secured by 1-4 family residential properties in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 818,
            "database": "fdic-sdi-data",
            "VarName": "nals",
            "ShortDescription": "Lease financing receivables in nonaccrual status",
            "LongDescription": "Total lease financing receivables that are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 248,
            "database": "fdic-sdi-data",
            "VarName": "NALTOT",
            "ShortDescription": "Total Nonaccrual Loans ñ FDIC Loss Sharing",
            "LongDescription": "Total nonaccrual loans that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 307,
            "database": "fdic-sdi-data",
            "VarName": "name",
            "ShortDescription": "Institution name",
            "LongDescription": "The legal name of the institution.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 305,
            "database": "fdic-sdi-data",
            "VarName": "namehcr",
            "ShortDescription": "Bank Holding Company (Regulatory Top Holder)",
            "LongDescription": "Note: Information on bank holding companies is only as of quarter-end.Regulatory top holder is any company that    directly or indirectly owns, controls or has power to vote 25 percent or more of a bank's or direct holding company's shares or  controls in any manner the election of a majority of the directors or trustees of a bank or direct holding company or  exercises a controlling influence over the management or policies of a bank or direct holding company.   Information on Thrift Holding Companies that own Savings Associations but do not own banks is not currently available in the ID System.  Source:  Federal Reserve Board National Information Center data base.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 402,
            "database": "fdic-sdi-data",
            "VarName": "Namehcr",
            "ShortDescription": "Bank Holding Company (Regulatory Top Holder)",
            "LongDescription": "Note: Information on bank holding companies is only as of quarter-end.Regulatory top holder is any company that    directly or indirectly owns, controls or has power to vote 25 percent or more of a bank's or direct holding company's shares or  controls in any manner the election of a majority of the directors or trustees of a bank or direct holding company or  exercises a controlling influence over the management or policies of a bank or direct holding company.   Information on Thrift Holding Companies that own Savings Associations but do not own banks is not currently available in the ID System.  Source:  Federal Reserve Board National Information Center data base.",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 817,
            "database": "fdic-sdi-data",
            "VarName": "naothln",
            "ShortDescription": "Other loans in nonaccrual status",
            "LongDescription": "All other loans that are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 797,
            "database": "fdic-sdi-data",
            "VarName": "nare",
            "ShortDescription": "Loans secured by real estate, total in nonaccrual status",
            "LongDescription": "Total loans secured by real estate which are no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 803,
            "database": "fdic-sdi-data",
            "VarName": "nareag",
            "ShortDescription": "Loans secured by farmland in nonaccrual status",
            "LongDescription": "Total farmland loans secured by real estate which are no longer accruing interest held in domestic offices of the institution.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 801,
            "database": "fdic-sdi-data",
            "VarName": "narecnfm",
            "ShortDescription": "Nonaccrual 1-4 family residential construction loans",
            "LongDescription": "Nonaccrual 1-4 family residential construction loans secured by real estate held in domestic offices note: not reported by tfr filers",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 802,
            "database": "fdic-sdi-data",
            "VarName": "narecnot",
            "ShortDescription": "Nonaccrual other construction, all land development and other land loans",
            "LongDescription": "Nonaccrual other construction and all land development and other land loans secured by real estate in domestic offices note: 1) not reported by tfr filers 2) data begins in 2007",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 800,
            "database": "fdic-sdi-data",
            "VarName": "narecons",
            "ShortDescription": "Construction and land development in nonaccrual status",
            "LongDescription": "Total construction and land development loans secured by real estate which are no longer accruing interest held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 806,
            "database": "fdic-sdi-data",
            "VarName": "narefor",
            "ShortDescription": "Real estate loans in foreign offices in nonaccrual status",
            "LongDescription": "Total loans in foreign offices of the institution that are secured by real estate and are no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 678,
            "database": "fdic-sdi-data",
            "VarName": "nareloc",
            "ShortDescription": "Nonaccrual home equity lines of credit",
            "LongDescription": "Total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit which are no longer accruing interest held in domestic offices of the institution.",
            "File": "Nonaccrual 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 804,
            "database": "fdic-sdi-data",
            "VarName": "naremult",
            "ShortDescription": "Secured by multifamily residential properties in nonaccrual status",
            "LongDescription": "Total multifamily (5 dwelling units or more) loans secured by real estate which are no longer accruing interest held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 805,
            "database": "fdic-sdi-data",
            "VarName": "narenres",
            "ShortDescription": "Loans secured by nonfarm nonresidential properties in nonaccrual status",
            "LongDescription": "Total nonfarm, nonresidential loans secured by real estate which are no longer accruing interest held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 798,
            "database": "fdic-sdi-data",
            "VarName": "narenus",
            "ShortDescription": "Laons to non-U.S. addressees, in nonaccrual status",
            "LongDescription": "Total loans secured by real estate (to non-U.S. addressees) which are no longer accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 675,
            "database": "fdic-sdi-data",
            "VarName": "nareres",
            "ShortDescription": "Secured by 1-4 family residential properties in nonaccrual status",
            "LongDescription": "Total loans secured by 1-4 family residential properties that are no longer accruing interest held in domestic offices of the institution.",
            "File": "Net Loans and Leases.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 677,
            "database": "fdic-sdi-data",
            "VarName": "NARERSF2",
            "ShortDescription": "Nonaccrual loans secured  by 1-4 Family junior liens",
            "LongDescription": "Closed-end loans secured by junior liens on 1-4 family residential properties that are held in domestic office and are past due and no longer accruing interest.",
            "File": "Nonaccrual 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 676,
            "database": "fdic-sdi-data",
            "VarName": "NARERSFM",
            "ShortDescription": "Nonaccrual loans secured  by 1-4 Family first liens",
            "LongDescription": "Closed-end loans secured by first liens on 1-4 family residential properties that are held in domestic office and are past due and no longer accruing interest.",
            "File": "Nonaccrual 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 561,
            "database": "fdic-sdi-data",
            "VarName": "NARSCI",
            "ShortDescription": "Nonaccrual Restructured C&I Loans",
            "LongDescription": "Nonaccrual restructured commercial and industrial loans. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 558,
            "database": "fdic-sdi-data",
            "VarName": "NARSCONS",
            "ShortDescription": "Nonaccrual Restructured Construction Loans",
            "LongDescription": "Total nonaccrual restructured construction, land development and other land loans secured by real estate in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 556,
            "database": "fdic-sdi-data",
            "VarName": "NARSLNFM",
            "ShortDescription": "Nonaccrual Restructured 1-4 Family  Loans",
            "LongDescription": "Nonaccrual restructured loans secured by 1-4 family residential properties in domestic offices. available as of march 2008",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 557,
            "database": "fdic-sdi-data",
            "VarName": "NARSLNLS",
            "ShortDescription": "Restructured loans and leases in nonaccrual status",
            "LongDescription": "Total restructured loans and lease financing receivables that are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 555,
            "database": "fdic-sdi-data",
            "VarName": "NARSLNLT",
            "ShortDescription": "Total Nonaccrual Restructured Loans",
            "LongDescription": "Total nonaccrual restructured loans. <br><br>Note: Prior to March 2011, excludes loans to individuals for household, family and other personal expenditures for call report filers.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 559,
            "database": "fdic-sdi-data",
            "VarName": "NARSMULT",
            "ShortDescription": "Nonaccrual Restructured Multifamily Loans",
            "LongDescription": "Nonaccrual restructured loans on multifamily (5 or more) residential properties secured by real estate in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 560,
            "database": "fdic-sdi-data",
            "VarName": "NARSNRES",
            "ShortDescription": "Nonaccrual Restructured Non farm nonresidential Loans",
            "LongDescription": "Total nonaccrual restructured loans secured by nonfarm nonresidential properties in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 562,
            "database": "fdic-sdi-data",
            "VarName": "NARSOTH",
            "ShortDescription": "Restructured Nonaccrual All Other Loans",
            "LongDescription": "Nonaccrual restructured all other loans (including loans to individuals for household, family and other personal expenditures). Note: This item also includes loans secured by farmland in domestic offices, loans to depository institutions and acceptances of other banks, loans to finance agricultural production and other loans to farmers, loans to individuals for household, family and other personal expenditures, loans to foreign governments and official institutions, loans secured by real estate in foreign offices and other loans. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 819,
            "database": "fdic-sdi-data",
            "VarName": "nascdebt",
            "ShortDescription": "Debt securities and other assets in nonaccrual status",
            "LongDescription": "Total debt securities and other assets (excludes other real estate owned and other repossessed assets) which are no longer accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 692,
            "database": "fdic-sdi-data",
            "VarName": "nccomrer",
            "ShortDescription": "% Loans Noncurrent:Commercial RE not secured by RE",
            "LongDescription": "Loans to finance commercial real estate, construction and land development activities (not secured by real estate) which are 90 days past due or nonaccrual as a percent of total loans to finance commercial real estate, construction and land activities (not secured by real estate).",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 149,
            "database": "fdic-sdi-data",
            "VarName": "NCGTYPAR",
            "ShortDescription": "Noncurrent loans which are wholly or partially guaranteed by the U.S.",
            "LongDescription": "Loans and leases which are wholly or partially guaranteedby the US government past due 90 days or more andnonaccrual on a consolidated basis. Listed as memoranda only and is included in total noncurrent total assets.<br><br> Important note: As of March 2011, no longer includes loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 148,
            "database": "fdic-sdi-data",
            "VarName": "nclnls",
            "ShortDescription": "Noncurrent loans and leases",
            "LongDescription": "Assets past due 90 days or more, plus assets placed in nonaccrual status.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 679,
            "database": "fdic-sdi-data",
            "VarName": "nclnlsr",
            "ShortDescription": "Noncurrent loans to loans",
            "LongDescription": "Total noncurrent loans and leases, Loans and leases 90 days or more past due plus loans in nonaccrual status,  as a percent of gross loans and leases.",
            "File": "Net Loans and Leases.csv; Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 681,
            "database": "fdic-sdi-data",
            "VarName": "ncreconr",
            "ShortDescription": "% Loans Noncurrent:Construction & land development",
            "LongDescription": "Noncurrent construction and land development loans secured as a percent of total construction and land development loans secured in domestic offices.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 685,
            "database": "fdic-sdi-data",
            "VarName": "ncrelocr",
            "ShortDescription": "% Loans Noncurrent: Home equity loans",
            "LongDescription": "Noncurrent revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit as a percent of total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit held in domestic offices.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 683,
            "database": "fdic-sdi-data",
            "VarName": "ncremulr",
            "ShortDescription": "% Loans Noncurrent: Multifamily residential",
            "LongDescription": "Noncurrent multifamily residential real estate (5 or more) loans as a percent of total multifamily residential real estate loans in domestic offices.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 682,
            "database": "fdic-sdi-data",
            "VarName": "ncrenrer",
            "ShortDescription": "% Loans Noncurrent: Commercial real estate",
            "LongDescription": "Noncurrent nonfarm nonresidential real estate loans as a percent of total nonfarm nonresidential real estate loans in domestic offices.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 680,
            "database": "fdic-sdi-data",
            "VarName": "ncrer",
            "ShortDescription": "% Loans Noncurrent: Real estate loans",
            "LongDescription": "Real estate loans past due 90 days or more plus loans placed in nonaccrual status as a percent of real estate loans.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 686,
            "database": "fdic-sdi-data",
            "VarName": "ncrereor",
            "ShortDescription": "Percent of loans noncurrent - All other family",
            "LongDescription": "Noncurrent loans secured by 1-4 other properties (includes all 1-4 family loans except home equity loans) as a percent of 1-4 other property loans.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 684,
            "database": "fdic-sdi-data",
            "VarName": "ncreresr",
            "ShortDescription": "% Loans Noncurrent: 1-4 family residential",
            "LongDescription": "Noncurrent loans secured by 1-4 family residential properties (including all 1-4 family loans except home equity loans) as a percent of total 1-4 family residential mortgage loans. This only applies to loans held in domestic offices.",
            "File": "Noncurrent loans to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 72,
            "database": "fdic-sdi-data",
            "VarName": "netgnast",
            "ShortDescription": "Net gains (losses) on sales of other assets (excluding securities)",
            "LongDescription": "Reported net gains or (losses) on sales or other disposal of other assets (e.g. premises and fixed assets, personal property acquired for debts previously contracted (such as automobiles, boats, equipment, and appliances); and coins, art, and other similar assets. Prior to March 2001 this was reported as a memoranda item only and was included in all other noninterest income. Also, prior to March 2001, gains and losses on sale of premises and fixed assets were reported as either noninterest income or noninterest expense.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 70,
            "database": "fdic-sdi-data",
            "VarName": "netgnsln",
            "ShortDescription": "Net gains (losses) on sales of loans",
            "LongDescription": "Reported net gains or (losses) on sales or other disposal of loans and leases. This includes unrealized losses on loans and leases held for sale. Prior to March 2001 this was reported as a memoranda item only and was included in all other noninterest income. Also prior to March 2001 gains or losses on the sale of loans were reported as either noninterest income or noninterest expense.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 71,
            "database": "fdic-sdi-data",
            "VarName": "netgnsre",
            "ShortDescription": "Net gains (losses) on sales of other real estate owned",
            "LongDescription": "Reported net gains or (losses) on the sales or other disposals of other real estate owned, increases and decreases in the valuation allowance for already foreclosed real estate, and write-downs charged to expense.",
            "File": "Additional Noninterest Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 452,
            "database": "fdic-sdi-data",
            "VarName": "NETIMIN",
            "ShortDescription": "Minority interest net income",
            "LongDescription": "Net income (loss) attributable to noncontrolling (minority) interests on a consolidated basis. note: available starting march 31, 2009.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 453,
            "database": "fdic-sdi-data",
            "VarName": "NETINBM",
            "ShortDescription": "Net income of bank and minority interests.",
            "LongDescription": "Net income (loss) attributable to the bank and noncontrolling (minority) interests on a consolidated basis. note: available beginning march 31, 2009.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 273,
            "database": "fdic-sdi-data",
            "VarName": "netinc",
            "ShortDescription": "Net income",
            "LongDescription": "Net interest income plus total noninterest income plus realized gains (losses) on securities and extraordinary items, less total noninterest expense, loan loss provisions and income taxes.",
            "File": "Changes in Bank Equity Capital.csv; Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 438,
            "database": "fdic-sdi-data",
            "VarName": "nim",
            "ShortDescription": "Net interest income",
            "LongDescription": "Total interest income minus total interest expense. It represents the difference between interest and dividends earned on interest-bearing assets and interest paid to depositors and other creditors.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 835,
            "database": "fdic-sdi-data",
            "VarName": "nimy",
            "ShortDescription": "Net interest margin",
            "LongDescription": "Total interest income less total interest expense (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=ernast5'> average earning assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 455,
            "database": "fdic-sdi-data",
            "VarName": "noij",
            "ShortDescription": "Net operating income",
            "LongDescription": "Net income excluding discretionary transactions such as gains (losses) on the sale of investment securities and extraordinary items. Income taxes subtracted from operating income have been adjusted to exclude the portion applicable to securities gains (losses).",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 839,
            "database": "fdic-sdi-data",
            "VarName": "noijy",
            "ShortDescription": "Net operating income to assets",
            "LongDescription": "Net operating income (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 440,
            "database": "fdic-sdi-data",
            "VarName": "nonii",
            "ShortDescription": "Total noninterest income",
            "LongDescription": "Income from fiduciary activities, plus service charges on deposit accounts in domestic offices, plus trading gains (losses) and fees from foreign exchange transactions, plus other foreign transaction gains (losses), plus other gains (losses) and fees from trading assets and liabilities.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 836,
            "database": "fdic-sdi-data",
            "VarName": "noniiay",
            "ShortDescription": "Noninterest income to average assets",
            "LongDescription": "Income derived from bank services and sources other than interest bearing assets (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 444,
            "database": "fdic-sdi-data",
            "VarName": "nonix",
            "ShortDescription": "Total noninterest expense",
            "LongDescription": "Salaries and employee benefits, expenses of premises and fixed assets (net of rental income), and other noninterest expenses.",
            "File": "Income and Expense.csv",
            "AON": "numeric"
        },
        {
            "V1": 837,
            "database": "fdic-sdi-data",
            "VarName": "nonixay",
            "ShortDescription": "Noninterest expense to average assets",
            "LongDescription": "Salaries and employee benefits, expenses of premises and fixed assets, and other noninterest expenses (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 851,
            "database": "fdic-sdi-data",
            "VarName": "nperfv",
            "ShortDescription": "Noncurrent assets plus other real estate owned to assets",
            "LongDescription": "Noncurrent assets as a percent of total assets.     Noncurrent assets are defined as assets that are past due 90 days or more plus assets placed in nonaccrual status plus other real estate owned (excluding direct and indirect investments in real estate).",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 520,
            "database": "fdic-sdi-data",
            "VarName": "ntag",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Net amount of loans to finance agricultural production and other loans to farmers that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 530,
            "database": "fdic-sdi-data",
            "VarName": "ntagsm",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers",
            "LongDescription": "Net amount of loans to finance agricultural production and other loans to farmers that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is reported only by institutions with assets of $300 million or less.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 525,
            "database": "fdic-sdi-data",
            "VarName": "NTAUTO",
            "ShortDescription": "Auto Loans - Net Charge-Offs",
            "LongDescription": "Net charged-off loans to individuals for household, family and other personal expenditures: automobile loans debited to the allowance for loan and lease losses. Quarterly Variable: NTAUTOQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "alpha"
        },
        {
            "V1": 521,
            "database": "fdic-sdi-data",
            "VarName": "ntci",
            "ShortDescription": "Commercial and industrial loans",
            "LongDescription": "Net amount of commercial and industrial loans that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  Note: For banks with assets of less than $300 million prior to 2001, this item includes all other loans (loans to depository institutions, agricultural loans, etc.).",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 522,
            "database": "fdic-sdi-data",
            "VarName": "ntcinus",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "Net amount of commercial and industrial loans with non-U.S. addressees that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 643,
            "database": "fdic-sdi-data",
            "VarName": "ntcomrer",
            "ShortDescription": "% Net Loans Charged-off:Coml. RE not secured by RE",
            "LongDescription": "Net charged-off commercial real estate loans not secured by real estate (annualized) as a percent of average total commercial real estate loans not secured by real estate.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 523,
            "database": "fdic-sdi-data",
            "VarName": "ntcon",
            "ShortDescription": "Loans to individuals",
            "LongDescription": "Net amount of loans to individuals for household, family, and other personal expenditures that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 526,
            "database": "fdic-sdi-data",
            "VarName": "NTCONOTH",
            "ShortDescription": "Other Consumer Loans Net Charge-Offs",
            "LongDescription": "Net charged-off loans to individuals for household, family, and other personal expenditures:  All other loans debited to the allowance for loan and lease losses.Quarterly variable: NTCONOTQ",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 524,
            "database": "fdic-sdi-data",
            "VarName": "ntcrcd",
            "ShortDescription": "Credit card loan net charge offs",
            "LongDescription": "Net amount of credit card loans to individuals that have been charged-off and debited to the allowance for loan and lease losses established by the institution. note: prior to 2001, included revolving credit plans other than credit cards.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 518,
            "database": "fdic-sdi-data",
            "VarName": "ntdep",
            "ShortDescription": "Loans to depository institutions",
            "LongDescription": "Net amount of loans to depository institutions and acceptances of other banks that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 519,
            "database": "fdic-sdi-data",
            "VarName": "ntdepnus",
            "ShortDescription": "To foreign banks",
            "LongDescription": "Net amount of loans to foreign depository institutions and acceptances of other banks that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 527,
            "database": "fdic-sdi-data",
            "VarName": "ntforgv",
            "ShortDescription": "Loans to foreign governments and official institutions",
            "LongDescription": "Net amount of loans to foreign governments and official institutions that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 454,
            "database": "fdic-sdi-data",
            "VarName": "ntlnls",
            "ShortDescription": "Net charge-offs",
            "LongDescription": "Total loans and leases charged-off (removed from balance sheet because of uncollectibility), less amounts recovered on loans and leases previously charged-off.",
            "File": "Gross Fiduciary and Related Services Income.csv; Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 630,
            "database": "fdic-sdi-data",
            "VarName": "ntlnlsr",
            "ShortDescription": "Net charge-offs to loans",
            "LongDescription": "Gross loan and lease financing receivable charge-offs, less gross recoveries, (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=lnlsgr5'> average total loans and lease financing receivables</a>.",
            "File": "Maximum Amount of Credit Exposure Retained.csv; Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 529,
            "database": "fdic-sdi-data",
            "VarName": "ntls",
            "ShortDescription": "Lease financing receivables",
            "LongDescription": "Net amount of lease financing receivables that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 528,
            "database": "fdic-sdi-data",
            "VarName": "ntother",
            "ShortDescription": "Other loans",
            "LongDescription": "Net amount of all other loans that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 694,
            "database": "fdic-sdi-data",
            "VarName": "ntr",
            "ShortDescription": "Nontransaction accounts",
            "LongDescription": "The sum of the following accounts held in domestic offices: money market deposit accounts (MMDAs), other savings deposits and all time deposits. prior to 2004, this item is not available for tfr reporters.",
            "File": "Net Loans and Leases.csv; Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 337,
            "database": "fdic-sdi-data",
            "VarName": "ntrcdsm",
            "ShortDescription": "Amount ($)  - time deposits less than $100,000",
            "LongDescription": "Total time deposits, both certificates of deposits and time open-accounts, under $100,000 held in domestic offices. note: although standard fdic insurance coverage was temporarily raised from $100,000 to $250,000 in october 2008, institutions are required to report this item based on the $100,000 coverage limit through December 2009. This item is not available for TFR Reporters.",
            "File": "Demographic Information.csv; Time Deposits of Less Than $100,000.csv",
            "AON": "numeric"
        },
        {
            "V1": 345,
            "database": "fdic-sdi-data",
            "VarName": "NTRCDSMJ",
            "ShortDescription": "Time deposits less than or equal to insurance limit",
            "LongDescription": "Time deposits less than or equal to the standard insurance limit held in domestic offices. available as of march 2010, this item is reported based on the temporary increase to the standard insurance limit of $250,000 which lagged behind the initial adoption of the temporary increase that became effective October 3, 2008.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 698,
            "database": "fdic-sdi-data",
            "VarName": "ntrcomot",
            "ShortDescription": "Commercial banks and other depository institutions in the U.S.",
            "LongDescription": "Nontransaction accounts of commercial banks and other depository institutions in the U.S. held in domestic offices.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 509,
            "database": "fdic-sdi-data",
            "VarName": "ntre",
            "ShortDescription": "Loans secured by real estate, total",
            "LongDescription": "The net amount of charged-off loans secured by real estate debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 513,
            "database": "fdic-sdi-data",
            "VarName": "ntreag",
            "ShortDescription": "Secured by farmland",
            "LongDescription": "Net amount of loans secured by farmland (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.  This item is not available for TFR Reporters.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 512,
            "database": "fdic-sdi-data",
            "VarName": "ntrecons",
            "ShortDescription": "Construction and land development",
            "LongDescription": "Net amount of real estate loans (which are held in domestic offices) for construction and land development purposes that have charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 632,
            "database": "fdic-sdi-data",
            "VarName": "ntrecosr",
            "ShortDescription": "% Net Loans Charged-off:Construction & development",
            "LongDescription": "Net charged-off construction and land development loans secured by real estate (annualized) as a percent of average total construction and land development loans secured by real estate.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 517,
            "database": "fdic-sdi-data",
            "VarName": "ntrefor",
            "ShortDescription": "Real estate loans in foreign offices",
            "LongDescription": "The net amount of charged-off loans secured by real estate and held in foreign offices of the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 629,
            "database": "fdic-sdi-data",
            "VarName": "ntreloc",
            "ShortDescription": "Home equity lines of credit ñ net charge-offs",
            "LongDescription": "Net amount of open-end loans secured by 1-4 family residential properties and extended under lines of credit (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Net Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 636,
            "database": "fdic-sdi-data",
            "VarName": "ntrelocr",
            "ShortDescription": "% Net Loans Charged-off: Home equity loans",
            "LongDescription": "Net charged-off revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit (annualized) as a percent of average total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 634,
            "database": "fdic-sdi-data",
            "VarName": "ntremulr",
            "ShortDescription": "% Net Loans Charged-off: Multi-family residential",
            "LongDescription": "Net charged-off loans secured by multi-family (5 or more) residential properties (annualized) as a percent of average total loans secured by multi-family residential properties.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 515,
            "database": "fdic-sdi-data",
            "VarName": "ntremult",
            "ShortDescription": "Secured by multifamily residential properties",
            "LongDescription": "Net amount of multifamily (5 or more) residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 516,
            "database": "fdic-sdi-data",
            "VarName": "ntrenres",
            "ShortDescription": "Secured by nonfarm nonresidential properties",
            "LongDescription": "Net amount of nonfarm nonresidential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 633,
            "database": "fdic-sdi-data",
            "VarName": "ntrenrsr",
            "ShortDescription": "% Net Loans Charged-off: Commercial real estate",
            "LongDescription": "Net charged-off loans secured by nonfarm nonresidential properties (annualized) as a percent of average total loans secured by nonfarm nonresidential properties.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 510,
            "database": "fdic-sdi-data",
            "VarName": "ntrenus",
            "ShortDescription": "To non-U.S. addressees",
            "LongDescription": "The net amount of charged-off loans secured by real estate (whose addresses are not within the U.S.) debited to the allowance for loan and lease losses established by the institution.  This information is not available on a quarterly basis.",
            "File": "Loan Charge-Offs and Recoveries.csv",
            "AON": "numeric"
        },
        {
            "V1": 637,
            "database": "fdic-sdi-data",
            "VarName": "ntreothr",
            "ShortDescription": "All other 1-4 family - Percent of loans charged-off, net",
            "LongDescription": "Net charged-off all other loans secured by 1-4 family residential properties in domestic offices asa percent of all other loans secured by 1-4 family residential properties.Note: prior to march 2001, listed as a memorandum item",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 631,
            "database": "fdic-sdi-data",
            "VarName": "ntrer",
            "ShortDescription": "% Net Loans Charged-off: Total real estate loans",
            "LongDescription": "Net charged-off loans that are secured by real estate (annualized) as a percent of average total real estate loans.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 514,
            "database": "fdic-sdi-data",
            "VarName": "ntreres",
            "ShortDescription": "Secured by 1-4 family residential propertiesñ net charge-offs",
            "LongDescription": "Net amount of loans secured by 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.",
            "File": "Loan Charge-Offs and Recoveries.csv; Net Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 635,
            "database": "fdic-sdi-data",
            "VarName": "ntreresr",
            "ShortDescription": "% Net Loans Charged-off: 1-4 family residential",
            "LongDescription": "Net charged-off all loans secured by 1-4 family residential properties (annualized) as a percent of average total loans secured by 1-4 family residential properties.",
            "File": "Net charge-offs to loans.csv",
            "AON": "numeric"
        },
        {
            "V1": 628,
            "database": "fdic-sdi-data",
            "VarName": "NTRERSF2",
            "ShortDescription": "Loans secured by 1-4 family junior liens ñ net charge-offs",
            "LongDescription": "Net amount of loans secured by junior liens on 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution.<P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Net Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 627,
            "database": "fdic-sdi-data",
            "VarName": "NTRERSFM",
            "ShortDescription": "Loans secured by 1-4 family senior liens ñ net charge-offs",
            "LongDescription": "Net amount of loans secured by first liens on 1-4 family residential properties (which are held in domestic offices) that have been charged-off and debited to the allowance for loan and lease losses established by the institution. <P>Prior to 2004, this item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.</P>",
            "File": "Net Charge-offs 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 700,
            "database": "fdic-sdi-data",
            "VarName": "ntrfc",
            "ShortDescription": "Banks in foreign countries",
            "LongDescription": "Total nontransaction accounts of banks in foreign countries held in domestic offices.  This item is not reported by institutions with less than $100 million in total assets.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 699,
            "database": "fdic-sdi-data",
            "VarName": "ntrfcfg",
            "ShortDescription": "Foreign deposits",
            "LongDescription": "Total nontransaction accounts of banks in foreign countries, foreign government and official institutions (includes foreign central banks) held in domestic offices.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 701,
            "database": "fdic-sdi-data",
            "VarName": "ntrfg",
            "ShortDescription": "Foreign governments and official institutions",
            "LongDescription": "Total nontransaction accounts of foreign governments and official institutions (includes foreign central banks) held in domestic offices. This item is not reported by institutions with less than $100 million in total assets.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 695,
            "database": "fdic-sdi-data",
            "VarName": "ntripc",
            "ShortDescription": "Individuals, partnerships, and corporations",
            "LongDescription": "Total nontransaction accounts of individuals, partnerships and corporations (including certified and official checks) held in domestic offices. This item is not available for TFR Reporters with assets less than $300 million and risk-based capital ratios in excess of 12 percent.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 697,
            "database": "fdic-sdi-data",
            "VarName": "ntrmuni",
            "ShortDescription": "States and political subdivisions in the U.S.",
            "LongDescription": "Total nontransaction accounts of states, counties, municipalities, and local housing authorities (or political subdivisions) held in domestic offices.  Included are deposits of funds advanced to states and political subdivisions by the U.S. government and corporations, and deposits of withheld income taxes of states and political subdivisions.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 985,
            "database": "fdic-sdi-data",
            "VarName": "ntrsmmda",
            "ShortDescription": "Money market deposit accounts (MMDAs)",
            "LongDescription": "Total money market deposit accounts held in domestic offices. *†prior to 2004, this item is not available for TFR Reporters.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 986,
            "database": "fdic-sdi-data",
            "VarName": "ntrsoth",
            "ShortDescription": "Other savings deposits (excluding MMDAs)",
            "LongDescription": "Total savings deposits held in domestic offices, aside from money market deposit accounts. prior to 2004, this item is not available for TFR Reporters.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 987,
            "database": "fdic-sdi-data",
            "VarName": "ntrtime",
            "ShortDescription": "Total time deposits",
            "LongDescription": "Total nontransaction time deposits held in domestic offices. <p> Prior to 2004, this  item is not available for TFR reporters with assets less than $300 million and risk-based capital ratios in excess of 12 percent. </p>",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 340,
            "database": "fdic-sdi-data",
            "VarName": "ntrtmlg",
            "ShortDescription": "Amount  ($) - time deposits of $100,000 or more",
            "LongDescription": "Time certificates of deposit and open-account time deposits with balances of $100,000 or more held in domestic offices.  Listed as memoranda only and is included in total non-transaction accounts. <br><br>NOTE: Although standard FDIC insurance coverage was temporarily raised from $100,000 to $250,000 in October 2008, institutions are required to report this item based on the $100,000 coverage limit through December 2009<P>For <a href='HelpItemForm.asp?<br>SystemForm=ID&HelpItem=tfrrpt'>TFR Reporters</a>:<br> -   Prior to December 2006, includes all deposits (not just time deposits) with balances greater than $100,000.  <br> -  In December 2006, includes all non-retirement deposits with balances greater than $100,000 and all retirement deposit accounts with balances greater than $250,000.  <br> -  Beginning in 2007, this item only includes time deposits with balances greater than $100,000.",
            "File": "Demographic Information.csv; Time Deposits of $100,000 or More.csv",
            "AON": "numeric"
        },
        {
            "V1": 352,
            "database": "fdic-sdi-data",
            "VarName": "NTRTMLGJ",
            "ShortDescription": "Time deposits over the insurance limit of  $250,000",
            "LongDescription": "Time deposits over the standard $250,000 insurance limit held in domestic offices. available as of march 2010, this item is reported based on the temporary increase to the standard insurance limit of $250,000 which lagged behind the initial adoption of the temporary increase that became effective October 3, 2008. Not available for insured U.S. branches of a foreign chartered institutions (IBA)",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "numeric"
        },
        {
            "V1": 696,
            "database": "fdic-sdi-data",
            "VarName": "ntrusgov",
            "ShortDescription": "U.S. Government",
            "LongDescription": "Total nontransaction accounts of federal public funds made by or for the account of the U.S. government which are held in domestic offices.",
            "File": "Nontransaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 117,
            "database": "fdic-sdi-data",
            "VarName": "numemp",
            "ShortDescription": "Total employees (full-time equivalent)",
            "LongDescription": "The number of full-time employees on the payroll of the bank and its subsidiaries at the end of the quarter.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 150,
            "database": "fdic-sdi-data",
            "VarName": "oaienc",
            "ShortDescription": "Income earned, not collected on loans",
            "LongDescription": "Loan income earned but not collected which is also included in other assets.  For TFR Reporters, includes accrued interest receivables on securities from March 1984 through December 1989.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 158,
            "database": "fdic-sdi-data",
            "VarName": "OALIFGEN",
            "ShortDescription": "General account life insurance  assets",
            "LongDescription": "The amount of the bankís holdings of life insurance assets associated with general account insurance policies. In a general account life insurance policy, the general assets of the insurance company issuing the policy support the policyís cash surrender value. also included is the portion of the carrying value of: (1) separate account policies that represents general account claims on the insurance company, such as realizable deferred acquisition costs and mortality reserves;and (2) hybrid account policies that represents general account claims on the insurance company, such as any shortfall in the value of the separate account assets supporting the cash surrender value of the policies.",
            "File": "Assets and Liabilities.csv",
            "AON": "alpha"
        },
        {
            "V1": 160,
            "database": "fdic-sdi-data",
            "VarName": "Oalifhyb",
            "ShortDescription": "Hybrid life insurance assets",
            "LongDescription": "The amount of the bankís holdings of life insurance assets associated with hybrid account insurance policies. A hybrid account insurance policy combines features of both general and separate account insurance products. Similar to a general account life insurance policy, a hybrid policy offers a guaranteed minimum crediting rate, does not carry market value risk, and does not require stable value protection. However, like a separate account life insurance policy, a hybrid policyís cash surrender value is supported by assets segregated from the general assets of the insurance carrier. Because they are legally segregated, the assets of each separate account are not subject to claims on the insurer that arise out of any other business of the insurance company. Additionally, the bank holding the hybrid account life insurance policy is able to select the investment strategy in which the insurance premiums are invested. Under such an arrangement, the policyholder neither owns the underlying separate account created by the insurance carrier on its behalf nor controls investment. data available as of march 2011 for call reports only, not available for tfr filers.",
            "File": "Assets and Liabilities.csv",
            "AON": "alpha"
        },
        {
            "V1": 157,
            "database": "fdic-sdi-data",
            "VarName": "OALIFINS",
            "ShortDescription": "Life insurance assets",
            "LongDescription": "The amount of the bankís holdings of life insurance assets. Include the cash surrender value of life insurance reported by the insurance carrier, less any applicable surrender charges not reflected by the carrier in this reported value, on all forms of permanent life insurance policies owned by the bank, its consolidated subsidiaries, and grantor (rabbi) trusts established by the bank or its consolidated subsidiaries, regardless of the purposes for acquiring the insurance and regardless of whether the insurance is a general account obligation of the insurer or a separate account obligation of the insurer. also included are the bankís interest in insurance policies under split-dollar life insurance arrangements with directors, officers, and employees under both the endorsement and collateral assignment methods.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 159,
            "database": "fdic-sdi-data",
            "VarName": "OALIFSEP",
            "ShortDescription": "Separate account life insurance  assets",
            "LongDescription": "The amount of the bankís holdings of life insurance assets associated with separate account insurance policies. In a separate account policy, the policyís cash surrender value is supported by assets segregated from the general assets of the insurance carrier. Under such an arrangement, the policyholder neither owns the underlying separate account created by the insurance carrier on its behalf nor controls investment decisions in the underlying account, but does assume all investment and price risk. separate accounts are employed by life insurers to meet specific investment objectives of policyholders. the accounts are often maintained as separate accounting and reporting entities for pension plans as well as fixed benefit, variable annuity, and other products. investment income and investment gains and losses generally accrue directly to such policyholders and are not accounted for on the general accounts of the insurer. on the books of the insurer, the carrying values of separate account assets and liabilities usually approximate each other with little associated capital. Because they are legally segregated, the assets of each separate account are not subject to claims on the insurer that arise out of any other business of the insurance company.Data available as of March 2011 for Call Reports only, not available for TFR filers.",
            "File": "Assets and Liabilities.csv",
            "AON": "alpha"
        },
        {
            "V1": 169,
            "database": "fdic-sdi-data",
            "VarName": "obsdir",
            "ShortDescription": "Derivatives",
            "LongDescription": "Represents the sum of the following: interest-rate contracts (as defined as the notional value of interest-rate swap, futures, forward and option contracts), foreign-exchange-rate contracts, commodity contracts and equity contracts (defined similarly to interest-rate contracts).  Futures and forward contracts are contracts in which the buyer agrees to purchase and the seller agrees to sell, at a specified future date, a specific quantity of underlying at a specified price or yield. These contracts exist for a variety of underlyings, including traditional agricultural or physical commodities, as well as currencies and interest rates. Futures contracts are standardized and are traded on organized exchanges which set limits on counterparty credit exposure. Forward contracts do not have standardized terms and are traded over the counter.  Option contracts are contracts in which the buyer acquires the right to buy from or sell to another party some specified amount of underlying at a stated price (strike price) during a period or on a specified future date, in return for compensation (such as a fee or premium). The seller is obligated to purchase or sell the underlying at the discretion of the buyer of the contract. Swaps are obligations between two parties to exchange a series of cash flows at periodic intervals (settlement dates) for a specified period. The cash flows of a swap are either fixed or determined for each settlement date by multiplying the quantity of the underlying instrument (notional principal) by specified reference rates or prices. Except for currency swaps, the notional principal is used to calculate each payment but is not exchanged.  This item is not available for TFR Reporters.",
            "File": "Assets and Liabilities.csv; Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 332,
            "database": "fdic-sdi-data",
            "VarName": "occdist",
            "ShortDescription": "Office of the Comptroller District",
            "LongDescription": "The Office of the Comptroller of the Currency (OCC) District in which the institution is physically located. The districts are divided into four geographic regions.<ul><li><b>Northeastern District</b> -  Responsible for national banks and thrifts in Connecticut, Delaware, the District of Columbia, eastern Kentucky, Maine, Maryland, Massachusetts, New Hampshire, New Jersey, New York, North Carolina, Pennsylvania, Rhode Island, South Carolina, Vermont, Virginia, West Virginia.  </li> <li><b>Southern District</b>  - Responsible for national banks and thrifts headquartered in Alabama, Arkansas, Florida, Georgia, Louisiana, Mississippi, Oklahoma, Tennessee, and Texas.</li> <li><b>Central District</b> Responsible for national banks and thrifts headquartered in Illinois, Indiana, Kentucky, Michigan, Minnesota, eastern Missouri, North Dakota, Ohio, and Wisconsin. </li> <li><b>Western District</b> Responsible for national banks and thrifts headquartered in Alaska, Arizona, California, Colorado, Hawaii, Idaho, Iowa, Kansas, western Minnesota, western Missouri, Montana, Nebraska, Nevada, New Mexico, Oregon, South Dakota, Utah, Washington, and Wyoming.</li></ul>",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 309,
            "database": "fdic-sdi-data",
            "VarName": "offdom",
            "ShortDescription": "Number of Domestic U.S. Offices",
            "LongDescription": "The number of domestic offices (including headquarters) in the U.S. operated by active institutions.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 310,
            "database": "fdic-sdi-data",
            "VarName": "offfor",
            "ShortDescription": "Number of Foreign Offices",
            "LongDescription": "The number of foreign offices (outside the U.S. and U.S.territories) operated by active institutions.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 127,
            "database": "fdic-sdi-data",
            "VarName": "ore",
            "ShortDescription": "Other real estate owned",
            "LongDescription": "Includes direct and indirect investments in real estate. The amount is reflected net of valuation allowances. For Thrift Financial Reporters, the valuation allowances include allowances for other repossessed assets.",
            "File": "Assets and Liabilities.csv; Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 731,
            "database": "fdic-sdi-data",
            "VarName": "oreag",
            "ShortDescription": "Other real estate owned: Farmland",
            "LongDescription": "Primarily foreclosed or repossessed farmland held in domestic offices.  This item is not available for TFR Reporters.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 730,
            "database": "fdic-sdi-data",
            "VarName": "orecons",
            "ShortDescription": "Other real estate owned:Construction & development",
            "LongDescription": "Primarily foreclosed or repossessed construction and land development properties held in domestic offices.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 732,
            "database": "fdic-sdi-data",
            "VarName": "oregnma",
            "ShortDescription": "Foreclosed properties from GNMA loans",
            "LongDescription": "All other real estate owned - foreclosed properties from GNMA loans. note: 1.) listed as a memorandum only and is included in other real estate owned. 2.) For TFR filers, includes repossessed property wholly or partially guaranteed by US government agencies.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 725,
            "database": "fdic-sdi-data",
            "VarName": "oreinv",
            "ShortDescription": "Direct and indirect investments in real estate",
            "LongDescription": "Direct and indirect investments in real estate ventures excludes real estate and property acquired through foreclosure.<br><br>Beginning in June 2009 filed by TFR Reporters only.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 728,
            "database": "fdic-sdi-data",
            "VarName": "oremult",
            "ShortDescription": "Other Real Estate Owned: Multi-family residential",
            "LongDescription": "Primarily foreclosed or repossessed multi-family (5 or more) residential properties held in domestic offices.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 729,
            "database": "fdic-sdi-data",
            "VarName": "orenres",
            "ShortDescription": "Other real estate owned: Commercial real estate",
            "LongDescription": "Primarily foreclosed or repossessed nonfarm nonresidential properties held in domestic offices.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 726,
            "database": "fdic-sdi-data",
            "VarName": "oreoth",
            "ShortDescription": "OREO: Real estate acquired",
            "LongDescription": "Consists primarily of foreclosed property. Direct and indirect investments in real estate ventures are excluded. The amount is reflected net of valuation allowances.    For TFR Reporters, the valuation allowance subtracted also includes allowances for other repossessed assets. Also, the subcategories of property (1-4 family, Multifamily, etc...) acquired through foreclosure are reported gross  of valuation allowances while this total is reported net of valuation allowances.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 733,
            "database": "fdic-sdi-data",
            "VarName": "oreothf",
            "ShortDescription": "Other real estate owned in foreign offices",
            "LongDescription": "Primarily foreclosed or repossessed properties held in foreign offices.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 727,
            "database": "fdic-sdi-data",
            "VarName": "oreres",
            "ShortDescription": "Other real estate owned: 1-4 family residential",
            "LongDescription": "Primarily foreclosed or repossessed 1-4 family residential properties held in domestic offices.",
            "File": "Other Real Estate Owned.csv",
            "AON": "numeric"
        },
        {
            "V1": 163,
            "database": "fdic-sdi-data",
            "VarName": "othbfhlb",
            "ShortDescription": "FHLB advances",
            "LongDescription": "Borrowings or 'advances' from Federal Home Loan Banks (FHLB). Prior to March 2001 this item is only available for TFR Reporters, institutions that file a Thrift Financial Report.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 958,
            "database": "fdic-sdi-data",
            "VarName": "othborf",
            "ShortDescription": "Other borrowed funds",
            "LongDescription": "Other borrowed money held in foreign offices.  Beginning in March 1997, this item includes mortgage indebtedness and obligations under capitalized leases.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 375,
            "database": "fdic-sdi-data",
            "VarName": "othffc",
            "ShortDescription": "Futures and forward contracts",
            "LongDescription": "Notional amount of futures and forward contracts such as stock index and commodity (precious metals, wheat, cotton, livestock contracts) and contracts on other commodities and equities. This item is not available prior to March 1995.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 374,
            "database": "fdic-sdi-data",
            "VarName": "othnvs",
            "ShortDescription": "Notional value of other swaps",
            "LongDescription": "The notional amount of all outstanding equity, equity index and all other swap agreements not reportable as interest rate or foreign exchange contracts.  This item is not available prior to March 1995.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 1044,
            "database": "fdic-sdi-data",
            "VarName": "othoffbs",
            "ShortDescription": "All other off-balance sheet liabilities",
            "LongDescription": "All other off-balance sheet liabilities (excluding off-balance sheet derivatives).",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 377,
            "database": "fdic-sdi-data",
            "VarName": "othpoc",
            "ShortDescription": "Purchased option contracts",
            "LongDescription": "The contract amount of option contracts where the reporting institution has, for a fee, purchased the right to purchase or sell an equity instrument, equity index, a commodity or product not reportable as interest rate or foreign exchange contracts.  This item is not available prior to March 1995.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 376,
            "database": "fdic-sdi-data",
            "VarName": "othwoc",
            "ShortDescription": "Written option contracts",
            "LongDescription": "The gross amount of contracts where the reporting institution has obligated itself, for compensation, to purchase or sell an equity instrument, equity index, a commodity or product not reportable as interest rate or foreign exchange contracts.  This item is not available prior to March 1995.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 333,
            "database": "fdic-sdi-data",
            "VarName": "otsregnm",
            "ShortDescription": "Office of Thrift Supervision Region",
            "LongDescription": "The Office of Thrift Supervision (OTS) Region in which the institution is physically located. The five OTS Regions and their respective states are: Northeast - Connecticut, Delaware, Maine, Massachusetts, New Hampshire, New Jersey, New York, Pennsylvania, Rhode Island, Vermont, West Virginia Southeast - Alabama, District of Columbia, Florida, Georgia, Maryland, North Carolina, Puerto Rico, South Carolina, U.S. Virgin Islands, Virginia Central - Illinois, Indiana, Kentucky, Michigan, Ohio, Tennessee, Wisconsin Midwest - Arkansas, Colorado, Iowa, Kansas, Louisiana, Minnesota, Mississippi, Missouri, Nebraska, New Mexico, North Dakota, Oklahoma, South Dakota, Texas West - Alaska, American Samoa, Arizona, California, Guam, Hawaii, Idaho, Montana, Nevada, States of Micronesia, Oregon, Utah, Washington, Wyoming",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 113,
            "database": "fdic-sdi-data",
            "VarName": "OWNCRCI",
            "ShortDescription": "Recoveries On Loan Amounts C&I Loans",
            "LongDescription": "Commercial & Industrial LoansRecoveries On Loans That Are Part OF The Carrying Value OfThe Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures - Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 112,
            "database": "fdic-sdi-data",
            "VarName": "OWNCRCRD",
            "ShortDescription": "Recoveries On Loan Amounts Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesRecoveries On Loans That Are Part OF The Carrying Value OfThe Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures - Credit Card Receivables.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 111,
            "database": "fdic-sdi-data",
            "VarName": "OWNCRHEL",
            "ShortDescription": "Recoveries On Loan Amounts Home Equity Lines",
            "LongDescription": "Home Equity LinesRecoveries On Loans That Are Part OF The Carrying Value OfThe Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures - Home Equity Lines.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 110,
            "database": "fdic-sdi-data",
            "VarName": "OWNDRCI",
            "ShortDescription": "Charge-Offs On Loan Amounts C&I Loans",
            "LongDescription": "Commercial & Industrial LoansCharge-Offs On Loans That Are Part Of The Carrying ValueOf The Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures   - Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 109,
            "database": "fdic-sdi-data",
            "VarName": "OWNDRCRD",
            "ShortDescription": "Charge-Offs On Loan Amounts Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesCharge-Offs On Loans That Are Part Of The Carrying ValueOf The Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures   - Cards Card Receivables.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 108,
            "database": "fdic-sdi-data",
            "VarName": "OWNDRHEL",
            "ShortDescription": "Charge-Offs On Loan Amounts",
            "LongDescription": "Home Equity LinesCharge-Offs On Loans That Are Part Of The Carrying ValueOf The Reporting Bank's Ownership (Or Seller's) Interest InSecuritization Structures   - Home Equity Lines.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 116,
            "database": "fdic-sdi-data",
            "VarName": "OWNLNCI",
            "ShortDescription": "Amount of Ownership (Seller's) Interest, Carried as Loans C&I Loans",
            "LongDescription": "Commercial & Industrial LoansCarrying Value Of Seller's Interest Not In Form Of A Security.Seller's Interest Are To Be Reported As Loans And IncludedIn Schedule RC-C - Loans And Lease Financing Receivables -Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 115,
            "database": "fdic-sdi-data",
            "VarName": "OWNLNCRD",
            "ShortDescription": "Amount of Ownership (Seller's), Interest Carried as Loans Credit Cards Rec.",
            "LongDescription": "Credit Cards ReceivablesCarrying Value Of Seller's Interest Not In Form Of A Security.Seller's Interest Are To Be Reported As Loans And IncludedIn Schedule RC-C - Loans And Lease Financing Receivables - CreditCard Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 114,
            "database": "fdic-sdi-data",
            "VarName": "OWNLNHEL",
            "ShortDescription": "Amount of Ownership (Seller's), Interest Carried as Loans Home Equity Lines",
            "LongDescription": "Home Equity LinesCarrying Value Of Seller's Interest Not In Form Of A Security.Seller's Interest Are To Be Reported As Loans And IncludedIn Schedule RC-C - Loans And Lease Financing Receivables - HomeEquity Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 104,
            "database": "fdic-sdi-data",
            "VarName": "OWNP3CI",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days C&I Loans",
            "LongDescription": "Commercial & Industrial LoansOutstanding Principal Balance Of Loans 30-89 Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 103,
            "database": "fdic-sdi-data",
            "VarName": "OWNP3CRD",
            "ShortDescription": "Past Due Loan Amounts 30-89 Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesOutstanding Principal Balance Of Loans 30-89 Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Credit Card Receivables.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 102,
            "database": "fdic-sdi-data",
            "VarName": "OWNP3HEL",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days Home Equity Lines",
            "LongDescription": "Home Equity LinesOutstanding Principal Balance Of Loans 30-89 Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Home Equity Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 107,
            "database": "fdic-sdi-data",
            "VarName": "OWNP9CI",
            "ShortDescription": "Past Due Loan Amounts 90+ Days C&I Loans",
            "LongDescription": "Commercial & Industrial LoansOutstanding Principal Balance Of Loans 90+ Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 106,
            "database": "fdic-sdi-data",
            "VarName": "OWNP9CRD",
            "ShortDescription": "Past Due Loan Amounts 90+ Days Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesOutstanding Principal Balance Of Loans 90+ Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Credit Card Receivables.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 105,
            "database": "fdic-sdi-data",
            "VarName": "OWNP9HEL",
            "ShortDescription": "Past Due Loan Amounts 90+ Days Home Equity Lines",
            "LongDescription": "Home Equity LinesOutstanding Principal Balance Of Loans 90+ Days Past DueThat Are Part Of The Carrying Value Of The Reporting Bank's Ownership (Or Seller's) Interest In Securitization Structures -Home Equity Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 101,
            "database": "fdic-sdi-data",
            "VarName": "OWNSCCI",
            "ShortDescription": "Amount of Ownership (Seller's), Interest C&I Loans",
            "LongDescription": "Commercial & Industrial LoansCarrying Value Of Seller's Interest Not In Form Of A Security.Seller's Interest Are To Be Reported As Loans And IncludedIn Schedule RC-C - Loans And Lease Financing Receivables -Commercial And Industrial Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 100,
            "database": "fdic-sdi-data",
            "VarName": "OWNSCCRD",
            "ShortDescription": "Amount of Ownership (Seller's), Interest Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesCarrying Value Of Seller's Interest Not In Form Of A SecurityThat Is Included As Available-For-Sale Or Held-To-Maturity Securities In Schedule RC-B - Securities Or As Trading SecuritiesIn Schedule RC, Item 5, Trading Assets - Underlying Asset IsCredit Cards Receivables.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 99,
            "database": "fdic-sdi-data",
            "VarName": "OWNSCHEL",
            "ShortDescription": "Amount of Ownership (Seller's), Interest Home Equity Lines",
            "LongDescription": "Home Equity LinesCarrying Value Of Seller's Interest Not In Form Of A SecurityThat Is Included As Available-For-Sale Or Held-To-Maturity Securities In Schedule RC-B - Securities Or As Trading SecuritiesIn Schedule RC, Item 5, Trading Assets - Underlying Asset IsHome Equity Loans.",
            "File": "Amount of Ownership (Seller) Interests.csv",
            "AON": "numeric"
        },
        {
            "V1": 755,
            "database": "fdic-sdi-data",
            "VarName": "p3ag",
            "ShortDescription": "Loans to finance agricultural production and other loans to farmers, past due 30",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers past due 30 through 89 days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 766,
            "database": "fdic-sdi-data",
            "VarName": "p3agsm",
            "ShortDescription": "Loans for agricultural production and other loans to farmers, past due 30-89days",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers past due 30 through 89 days and still accruing interest.  Institutions with assets less than $300 million report this item only if their agricultural production loans exceed 5 percent of total loans.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 742,
            "database": "fdic-sdi-data",
            "VarName": "p3asset",
            "ShortDescription": "Assets past due 30-89 days",
            "LongDescription": "Total assets past due 30 through 89 days and still accruing interest.  Total assets include real estate loans, installment loans, credit cards and related plan loans, commercial, and all other loans, lease financing receivables, debt securities and other assets.  Note: The FFIEC considers 30 through 89 day past due data on an institution level confidential.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 760,
            "database": "fdic-sdi-data",
            "VarName": "P3AUTO",
            "ShortDescription": "30-89 Days P/D Auto Loans",
            "LongDescription": "Automobile loans to individuals for household, family and other personal expenditures past due 30 through 89 days and still accruing interest. available as of march 2011",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 756,
            "database": "fdic-sdi-data",
            "VarName": "p3ci",
            "ShortDescription": "Commercial and industrial loans, past due 30 - 89 days",
            "LongDescription": "Total commercial and industrial loans past due 30 through 89 days and still accruing interest, which are held in domestic offices of the institution.  Institutions with assets of less than $300 million include all other loans in this item.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 757,
            "database": "fdic-sdi-data",
            "VarName": "p3cinus",
            "ShortDescription": "To non-U.S. addressees, past due 30 - 89 days",
            "LongDescription": "Total construction and land development loans secured by real estate (with non-U.S. addressees) past due 30 through 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 758,
            "database": "fdic-sdi-data",
            "VarName": "p3con",
            "ShortDescription": "Loans to individuals, past due 30 - 89 days",
            "LongDescription": "Total loans to individuals for household, family, and other personal expenditures past due 30 through 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 761,
            "database": "fdic-sdi-data",
            "VarName": "P3CONOTH",
            "ShortDescription": "30-89 Days P/D-Other Consumer",
            "LongDescription": "Other loans to individuals for household, family and other personal expenditures past due 30 through 89 days and still accruing interest on a consolidated basis (excludes credit cards). Note: This information on an institution level is considered confidential by the FFIEC. beginning march 2001, includes revolving credit plans other than credit cards. beginning march 2011, excludes automobile loans.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 759,
            "database": "fdic-sdi-data",
            "VarName": "p3crcd",
            "ShortDescription": "Credit cards and related plans, past due 30 - 89 days",
            "LongDescription": "Total credit card loans to individuals past due 30 through 89 days and still accruing interest. Prior to 2001, included revolving credit plans other than credit cards.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 753,
            "database": "fdic-sdi-data",
            "VarName": "p3dep",
            "ShortDescription": "Loans to depository institutions, past due 30 - 89 days",
            "LongDescription": "Total loans to depository institutions and acceptances of other banks past due 30 through 89 days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 754,
            "database": "fdic-sdi-data",
            "VarName": "p3depnus",
            "ShortDescription": "Loans to foreign banks, past due 30 - 89 days",
            "LongDescription": "Total loans to foreign depository institutions and acceptances of other foreign banks past due 30 through 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 762,
            "database": "fdic-sdi-data",
            "VarName": "p3fg",
            "ShortDescription": "Loans to foreign governments and official institutions,  past due 30 - 89 days",
            "LongDescription": "Total loans to foreign governments and official institutions past due 30 through 89 days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 823,
            "database": "fdic-sdi-data",
            "VarName": "P3GTY",
            "ShortDescription": "Guaranteed portion of loans and leases, excluding GNMA loans, 30-89days past due",
            "LongDescription": "The maximum amount recoverable from the U.S. Government for past due 30 to 89 day loans and leases (excluding GNMA loans) that are guaranteed by the U.S. Government and still accruing interest on a consolidated basis.  The U.S. Government includes its agencies and its government-sponsored agencies, under the guarantee or insurance provisions applicable to the loans and leases. Listed as memoranda only and is included in total loans and leases past due 30-89 days or more and still accruing interest. GNMA loans are guaranteed by the Government National Mortgage Association or commonly know as Ginnie Mae. FRB MDRM Number:  RFCD5615 or RCON5615<br><br>   Note: Prior to March 2011, included loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 824,
            "database": "fdic-sdi-data",
            "VarName": "P3GTYGNM",
            "ShortDescription": "Rebooked GNMA loans repurchased or are eligible for repurchase, 30-89 days pas",
            "LongDescription": "Past due 30-89 day rebooked GNMA loans that have been repurchased or are eligible for repurchase by seller-servicers of GNMA loans; and past due 30-89 day loans that have been purchased out of GNMA securitizations by servicers of GNMA loans that were not the transferors of the loans. GNMA loans are guaranteed by the Government National Mortgage Association or commonly know as Ginnie Mae. Listed here as memoranda only and is included in total loans and leases past due 30-89 days and still accruing interest. FRB Number:  RCFDC866  or RCONC866 <br><br> Note: Prior to March 2011, included loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 768,
            "database": "fdic-sdi-data",
            "VarName": "P3GTYPAR",
            "ShortDescription": "Loans and leases 30-89 past due, U.S. Government wholly or partially guaranteed",
            "LongDescription": "Loans and leases for which repayment of principal is wholly or partially guaranteed or insured by the U.S. Government, including its agencies and its government-sponsored agencies that are past due 30 to 89 days and are still accruing interest on a consolidated basis. Examples include loans guaranteed by the Small Business Administration, and the Federal Housing Administration. Excluded are loans and leases guaranteed or insured by state or local governments, state or local government agencies, foreign (non-U.S.) governments, and private agencies or organizations. Also excluded are loans and leases collateralized by securities issued by the U.S. Government, including its agencies and its government-sponsored agencies. Included in total loans and leases past due 30-89 days or more and are still accruing interest. FRB MDRM numbers: RFCD5612 or RCON5612 important note: prior to march 2011, included loans and leases covered by fdic loss-sharing agreements.",
            "File": "Other Real Estate Owned.csv; Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 234,
            "database": "fdic-sdi-data",
            "VarName": "P3LAG",
            "ShortDescription": "30-89 Days PD Farm loans - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of loans to finance agricultural production and other loans to farmers that are covered by FDIC loss-sharing agreements and past due 30 through 89 days and still accruing interest. reported separately for call 31 reporters only. call 41 reporters and tfr reporters include these loans in past due 30-89 days all other covered loans and leases (p3loth).available as of march 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 232,
            "database": "fdic-sdi-data",
            "VarName": "P3LCI",
            "ShortDescription": "30-89 Days P/D C&I Loans- FDIC loss-sharing agreements",
            "LongDescription": "Commercial and industrial loans past due 30 through 89 days and still accruing interest that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 233,
            "database": "fdic-sdi-data",
            "VarName": "P3LCON",
            "ShortDescription": "30-89 D P/D Consumer loans  - FDIC loss-sharing agreements",
            "LongDescription": "Total consumer loans to individual for household, family and other personal expenditures past due 30-89 days or more and still accruing interest that are covered by FDIC loss-sharing agreements.<br><br>Note: Data begins in March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 236,
            "database": "fdic-sdi-data",
            "VarName": "P3LGTY",
            "ShortDescription": "30-89 P/D protected portion (GTY)- FDIC Loss Sharing Agreements",
            "LongDescription": "The total protected portion, or maximum amount recoverable from the FDIC under loss-sharing agreements, covering the loans and leases past due past due 30-89 days and still accruing interest. Is reported above and beyond the amount that has already been reflected in the measurement of the reporting bankís indemnification asset, which represents the right to receive payments from the FDIC under the loss-sharing agreement.<br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 767,
            "database": "fdic-sdi-data",
            "VarName": "P3LNSALE",
            "ShortDescription": "Loans held for sale past due 30-89 days",
            "LongDescription": "Loans and leases held for sale that are 30-89 days past due and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 235,
            "database": "fdic-sdi-data",
            "VarName": "P3LOTH",
            "ShortDescription": "30-89 D P/D Other Loans - FDIC loss-sharing agreements",
            "LongDescription": "All other loans and all leases past due 30 through 89 days and still accruing interest that are covered by FDIC loss-sharing agreements.<br><br>For TFR and CALL Form 041 filers, this item also includes loans to finance agricultural production and other loans farmers. <br><br>Available as of March 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 228,
            "database": "fdic-sdi-data",
            "VarName": "P3LREAG",
            "ShortDescription": "30-89 Day P/D RE Farm loans-FDIC loss-sharing agreements",
            "LongDescription": "Farmland loans secured by real estate past due 30 through 89 days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 227,
            "database": "fdic-sdi-data",
            "VarName": "P3LRECON",
            "ShortDescription": "30-89 P/D Construction -FDIC loss-sharing agreements",
            "LongDescription": "Total construction, land development and other land loans secured by real estate past due 30-89 days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements.. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 230,
            "database": "fdic-sdi-data",
            "VarName": "P3LREMUL",
            "ShortDescription": "30-89 Day P/D Multifamily loans - FDIC loss-sharing agreements",
            "LongDescription": "Multifamily (5 or more) residential property loans secured by real estate past due 30 through 89 days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 231,
            "database": "fdic-sdi-data",
            "VarName": "P3LRENRS",
            "ShortDescription": "30-89 P/D Nonfarm Nonresidential loans  - FDIC loss-sharing agreements",
            "LongDescription": "Total loans secured by nonfarm nonresidential properties past due 30-89 days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements . available as of march 2011",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 229,
            "database": "fdic-sdi-data",
            "VarName": "P3LRERES",
            "ShortDescription": "30-89 P/D 1-4 Family residential loans - FDIC loss-sharing agreements",
            "LongDescription": "Total loans secured by 1-4 family residential properties past due 30-89 days or more still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 764,
            "database": "fdic-sdi-data",
            "VarName": "p3ls",
            "ShortDescription": "Lease financing receivables, past due 30 - 89 days",
            "LongDescription": "Total lease financing receivables past due 30 through 89 days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 226,
            "database": "fdic-sdi-data",
            "VarName": "P3LTOT",
            "ShortDescription": "30-89 D P/D Total Loans- FDIC Loss Sharing",
            "LongDescription": "Total loans past due 30-89 days and still accruing interest that are covered by FDIC loss-sharing agreements. .<br><br> Available as of March 2011 and also as of March 2011 no longer included in Loans Wholly or Partially US Government Guaranteed.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 763,
            "database": "fdic-sdi-data",
            "VarName": "p3othln",
            "ShortDescription": "Other loans, past due 30 - 89 days",
            "LongDescription": "All other loans past due 30 through 89 days and still accruing interest.  For institutions with assets of less than $300 million, all other loans are included in commercial loans.   This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 743,
            "database": "fdic-sdi-data",
            "VarName": "p3re",
            "ShortDescription": "Loans secured by real estate, total past due 30  -  89 days",
            "LongDescription": "Total loans secured by real estate past due 30 through 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 749,
            "database": "fdic-sdi-data",
            "VarName": "p3reag",
            "ShortDescription": "Secured by farmland, past due 30  -  89 days",
            "LongDescription": "Total farmland loans secured by real estate past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 747,
            "database": "fdic-sdi-data",
            "VarName": "P3recnfm",
            "ShortDescription": "1-4 family residential construction loans past due 30 through 89 days",
            "LongDescription": "1-4 family residential construction loans secured by real estate past due 30 through 89 days and still interest held in domestic offices note: not reported by tfr filers",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 748,
            "database": "fdic-sdi-data",
            "VarName": "p3recnot",
            "ShortDescription": "Other construction all land development and other land loans past due 30-89 days",
            "LongDescription": "Other construction and all land development and other land loans secured by real estate past due 30 through 89 days and still accruing interest in domestic offices note: 1) not reported by tfr filers 2) data back to 2007",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 746,
            "database": "fdic-sdi-data",
            "VarName": "p3recons",
            "ShortDescription": "Construction and land development, past due 30  -  89 days",
            "LongDescription": "Total construction and land development loans secured by real estate past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 752,
            "database": "fdic-sdi-data",
            "VarName": "p3refor",
            "ShortDescription": "Real estate loans in foreign offices, past due 30  -  89 days",
            "LongDescription": "Total loans in foreign offices of the institution that are secured by real estate and are past due 30 - 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 737,
            "database": "fdic-sdi-data",
            "VarName": "p3reloc",
            "ShortDescription": "Past due 30-89 days home equity lines of credit",
            "LongDescription": "Total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due 30-89 Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 750,
            "database": "fdic-sdi-data",
            "VarName": "p3remult",
            "ShortDescription": "Secured by multifamily residential properties, past due 30  -  89 days",
            "LongDescription": "Total multifamily (5 dwelling units or more) loans secured by real estate past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 751,
            "database": "fdic-sdi-data",
            "VarName": "p3renres",
            "ShortDescription": "Secured by nonfarm nonresidential properties, past due 30  -  89 days",
            "LongDescription": "Total nonfarm, nonresidential loans secured by real estate past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 744,
            "database": "fdic-sdi-data",
            "VarName": "p3renus",
            "ShortDescription": "To non-U.S. addressees, past due 30  -  89 days",
            "LongDescription": "Total loans secured by real estate (to non-U.S. addressees) past due 30 through 89 days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 734,
            "database": "fdic-sdi-data",
            "VarName": "p3reres",
            "ShortDescription": "Secured by 1-4 family residential properties, past due 30  -  89 days",
            "LongDescription": "Total loans secured by 1-4 family residential properties past due 30 through 89 days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Nontransaction Accounts.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 736,
            "database": "fdic-sdi-data",
            "VarName": "P3RERSF2",
            "ShortDescription": "Past due 30-89 days secured  by 1-4 Family junior liens",
            "LongDescription": "Closed-end loans secured by junior liens on 1-4 family residential properties that are held in domestic office and are 30-89 days past due and still accruing interest.",
            "File": "Past Due 30-89 Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 735,
            "database": "fdic-sdi-data",
            "VarName": "P3RERSFM",
            "ShortDescription": "Past due 30-89 days secured  by 1-4 Family first liens",
            "LongDescription": "Closed-end loans secured by first liens on 1-4 family residential properties that are held in domestic office and are 30-89 days past due and still accruing interest.",
            "File": "Past Due 30-89 Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 545,
            "database": "fdic-sdi-data",
            "VarName": "P3RSCI",
            "ShortDescription": "C&I Loans restructured loans 30-89 Days P/D",
            "LongDescription": "Restructured commercial and industrial loans past due 30 through 89 days and still accruing interest. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 542,
            "database": "fdic-sdi-data",
            "VarName": "P3RSCONS",
            "ShortDescription": "Construction restructured loans 30-89 P/D",
            "LongDescription": "Total restructured construction, land development and other land loans secured by real estate past due 30 through 89 days and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 540,
            "database": "fdic-sdi-data",
            "VarName": "P3RSLNFM",
            "ShortDescription": "1-4 Family restructured loans 30-89 Day P/D",
            "LongDescription": "Restructured loans secured by 1-4 family residential properties past due 30-89 days and still accruing interest domestic offices.<br><br> Available as of March 2008",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 541,
            "database": "fdic-sdi-data",
            "VarName": "P3RSLNLS",
            "ShortDescription": "Restructured loans and leases, past due 30 - 89 days",
            "LongDescription": "Total restructured loans and lease financing receivables past due 30 through 89 days and still accruing interest.    This item is not available for TFR Reporters.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 539,
            "database": "fdic-sdi-data",
            "VarName": "P3RSLNLT",
            "ShortDescription": "Total restructured loans 30-89 Day P/D",
            "LongDescription": "Total restructured loans past due 30-89 days and still accruing interest.  <br><br>Note: Prior to March 2011, excludes loans to individuals for household, family and other personal expenditures for call report filers.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 543,
            "database": "fdic-sdi-data",
            "VarName": "P3RSMULT",
            "ShortDescription": "Multifamily restructured loans 30-89 Days P/D",
            "LongDescription": "Restructured loans on multifamily (5 or more) residential properties secured by real estate past due 30 through 89 days and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 544,
            "database": "fdic-sdi-data",
            "VarName": "P3RSNRES",
            "ShortDescription": "Nonfarm nonresidential loans restructured loans 30-89 Day P/",
            "LongDescription": "Total restructured loans secured by nonfarm nonresidential properties past due 30 through 89 days and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 546,
            "database": "fdic-sdi-data",
            "VarName": "P3RSOTH",
            "ShortDescription": "All Other Loans restructured and Past Due 30-89days",
            "LongDescription": "Restructured all other loans (including loans toindividuals for household, family and other personalexpenditures) past due 30 through 89 days andstill accruing interest. <br> <br>Note:this item also includes loans secured by farmland indomestic offices, loans to depository institutions andacceptances of other banks, loans to financeagricultural production and other loans to farmers,loans to individuals for household, family and otherpersonal expenditures, loans to foreign governmentsand official institutions, loans secured by real estatein foreign offices and other loan.<br><br>Note: Data begins in March 2011.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 765,
            "database": "fdic-sdi-data",
            "VarName": "p3scdebt",
            "ShortDescription": "Debt securities and other assets, past due 30 - 89 days",
            "LongDescription": "Total debt securities and other assets (excludes other real estate owned and other repossessed assets) past due 30 through 89 days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 782,
            "database": "fdic-sdi-data",
            "VarName": "p9ag",
            "ShortDescription": "Loans to finance agricultural and other loans to farmers, past due 90+ days",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers past due 90 or more days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 793,
            "database": "fdic-sdi-data",
            "VarName": "p9agsm",
            "ShortDescription": "Loans for agriculture  and other loans to farmers, past due 90+ days",
            "LongDescription": "Total loans to finance agricultural production and other loans to farmers past due 90 or more days and still accruing interest.   This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 769,
            "database": "fdic-sdi-data",
            "VarName": "p9asset",
            "ShortDescription": "Assets past due 90 or more days",
            "LongDescription": "Total assets past due 90 or more days and still accruing interest.  Total assets include real estate loans, installment loans, credit cards and related plan loans, commercial loans and all other loans, lease financing receivables, debt securities and other assets.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 787,
            "database": "fdic-sdi-data",
            "VarName": "P9AUTO",
            "ShortDescription": "90+ Days P/D Auto Loans",
            "LongDescription": "Automobile loans to individuals for household, family and other personal expenditures past due 90 days or more and still accruing interest. available as of march 2011",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 783,
            "database": "fdic-sdi-data",
            "VarName": "p9ci",
            "ShortDescription": "Commercial and industrial loans, past due 90+ days",
            "LongDescription": "Total commercial and industrial loans past due 90 or more days and still accruing interest which are held in domestic offices of the institution.  Institutions with assets of less than $300 million include all other loans in this item.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 784,
            "database": "fdic-sdi-data",
            "VarName": "p9cinus",
            "ShortDescription": "To non-U.S. addressees, past due 90+ days",
            "LongDescription": "Total construction and land development loans secured by real estate (with non-U.S. addressees) past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 785,
            "database": "fdic-sdi-data",
            "VarName": "p9con",
            "ShortDescription": "Loans to individuals, past due 90+ days",
            "LongDescription": "Total loans to individuals for household, family, and other personal expenditures past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 788,
            "database": "fdic-sdi-data",
            "VarName": "P9CONOTH",
            "ShortDescription": "90+ Days P/D-Other Consumer",
            "LongDescription": "Other loans to individuals for household, family and other personal expenditures past due 90 or more days and still accruing interest on a consolidated basis. beginning march 2001, includes revolving credit plans other than credit cards. beginning march 2011, excludes automobile loans.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 786,
            "database": "fdic-sdi-data",
            "VarName": "p9crcd",
            "ShortDescription": "Credit cards and related plans, past due 90+ days",
            "LongDescription": "Total credit card loans to individuals past due 90 or more days and still accruing interest. Prior to 2001, included revolving credit plans other than credit cards.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 780,
            "database": "fdic-sdi-data",
            "VarName": "p9dep",
            "ShortDescription": "Loans to depository institutions, past due 90+ days",
            "LongDescription": "Total loans to depository institutions and acceptances of other banks past due 90 or more days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 781,
            "database": "fdic-sdi-data",
            "VarName": "p9depnus",
            "ShortDescription": "Loans to foreign banks, past due 90+ days",
            "LongDescription": "Total loans to foreign depository institutions and acceptances of other foreign banks past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 789,
            "database": "fdic-sdi-data",
            "VarName": "p9fg",
            "ShortDescription": "Loans to foreign governments and official institutions, past due 90+ days",
            "LongDescription": "Total loans to foreign governments and official institutions past due 90 or more days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 825,
            "database": "fdic-sdi-data",
            "VarName": "P9GTY",
            "ShortDescription": "Guaranteed portion of loans and leases, excluding GNMA loans, 90 days past due",
            "LongDescription": "The maximum amount recoverable from the U.S. Government from past due 90 days or more loans and leases (excluding GNMA loans) that are guaranteed by the U.S. Government and still accruing interest on a consolidated basis.  The U.S. Government includes its agencies and its government-sponsored agencies, under the guarantee or insurance provisions applicable to the loans and leases. Listed here as memoranda only and is included in total loans and leases past due 90 days or more days and still accruing interest. GNMA loans are guaranteed by the Government National Mortgage Association or commonly know as Ginnie Mae. FRB Number:  RFCD5616 or RCON5616<br><br> Note: Prior to March 2011, included loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 826,
            "database": "fdic-sdi-data",
            "VarName": "P9GTYGNM",
            "ShortDescription": "Rebooked GNMA loans that have been repurchased or are eligible for repurchase,",
            "LongDescription": "Past due 90 or more day rebooked GNMA loans that have been repurchased or are eligible for repurchase by seller-servicers of GNMA loans and past due 90 days or more loans that have been purchased out of GNMA securitizations by servicers of GNMA loans that were not the transferors of the loans. GNMA loans are guaranteed by the Government National Mortgage Association, commonly know as Ginnie Mae. Included in total loans and leases past due 90 or more days and still accruing interest.  FRB Number:  RCFDC867 or RCONC867 <br><br> Note: Prior to March 2011, included loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 795,
            "database": "fdic-sdi-data",
            "VarName": "P9GTYPAR",
            "ShortDescription": "Loans and leases, wholly or partially guaranteed by the U.S. Government-90+PD",
            "LongDescription": "Loans and leases  for which repayment of principal is wholly or partially guaranteed or insured by the U.S. Government, including its agencies and its government-sponsored agencies, that are past due 90 days or more and are still accruing interest on a consolidated basis. Examples include loans guaranteed by the Small Business Administration, and the Federal Housing Administration. Excluded are loans and leases guaranteed or insured by state or local governments, state or local government agencies, foreign (non-U.S.) governments, and private agencies or organizations. Also excluded are loans and leases collateralized by securities issued by the U.S. Government, including its agencies and its government-sponsored agencies. Listed here as memoranda only and is included in total loans and leases past due 90+ days or more and still accruing interest. FRB Number:  RFCD5613 RCON5613 <br><br> Note: As of March 2011, no longer includes loans and leases covered by FDIC loss-sharing agreements.",
            "File": "Past Due and Nonaccrual Assets.csv; Past Due and Nonaccrual Loans Wholly or Partially US Gvmt Guaranteed.csv",
            "AON": "numeric"
        },
        {
            "V1": 245,
            "database": "fdic-sdi-data",
            "VarName": "P9LAG",
            "ShortDescription": "90+ Days P/D Farm loans - FDIC loss-sharing agreements",
            "LongDescription": "Carrying amount of loans to finance agricultural production and other loans to farmers that are covered by FDIC loss-sharing agreements and past due 90 or more days and still accruing interest. reported separately for call 31 reporters only. call 41 reporters and tfr reporters include these loans all other covered loans and leases in past due 90 days (p9loth).available as of march 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 243,
            "database": "fdic-sdi-data",
            "VarName": "P9LCI",
            "ShortDescription": "90+ D P/D C&I  - FDIC Loan Loss Sharing Agreement",
            "LongDescription": "Commercial and industrial loans past due 90 or more days and still accruing interest that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 244,
            "database": "fdic-sdi-data",
            "VarName": "P9LCON",
            "ShortDescription": "90+ D P/D Consumer Loans ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Total consumer loans to individuals for household, family and other personal expenditures past due 90 days or more and still accruing interest that are covered by FDIC loss-sharing agreements. This is test.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 247,
            "database": "fdic-sdi-data",
            "VarName": "P9LGTY",
            "ShortDescription": "90+ D P/D protected portion of covered loans (GTYY)-FDIC Loss Sharing Agreements",
            "LongDescription": "The maximum amount recoverable from the FDIC under loss-sharing agreements, or total protected portion, covering the loans and leases past due 90 days or more and still accruing interest. Is reported above and beyond the amount that has already been reflected in the measurement of the reporting bankís indemnification asset, which represents the right to receive payments from the FDIC under the loss-sharing agreement.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 794,
            "database": "fdic-sdi-data",
            "VarName": "P9LNSALE",
            "ShortDescription": "Loans held for sale, past due 90 or more days",
            "LongDescription": "Loans and leases held for sale that are 90 days or more past due and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 246,
            "database": "fdic-sdi-data",
            "VarName": "P9LOTH",
            "ShortDescription": "90+ D P/D Other Loans and Leases ñ FDIC Loss Sharing Agreements",
            "LongDescription": "All other loans and all leases past due 90 days or more and still accruing interest that are covered by FDIC loss-sharing agreements.<br><br>For TFR and CALL Form 041 filers, this item also includes loans to finance agricultural production and other loans farmers. <br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 239,
            "database": "fdic-sdi-data",
            "VarName": "P9LREAG",
            "ShortDescription": "90+ D P/D RE Farm Loans  - FDIC Loss Sharing Agreements",
            "LongDescription": "Farmland loans secured by real estate past due 90 days or more and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 238,
            "database": "fdic-sdi-data",
            "VarName": "P9LRECON",
            "ShortDescription": "90+ Days PD Construction loans-FDIC loss sharing agreements",
            "LongDescription": "Total construction, land development and other land loans secured by real estate past due 90 days or more and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements. available as of march 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 241,
            "database": "fdic-sdi-data",
            "VarName": "P9LREMUL",
            "ShortDescription": "90+ D P/D Multifamily Loans ñ FDIC  Loss Sharing Agreements",
            "LongDescription": "Multifamily (5 or more) residential property loans secured by real estate past due 90 or more days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 242,
            "database": "fdic-sdi-data",
            "VarName": "P9LRENRS",
            "ShortDescription": "90+ D P/D Nonfarm Nonresidential Properties ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Total loans secured by nonfarm nonresidential properties past due 90 or more days and still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 240,
            "database": "fdic-sdi-data",
            "VarName": "P9LRERES",
            "ShortDescription": "90+ D P/D 1-4 Family Loans ñ FDIC Loss Sharing Agreements",
            "LongDescription": "Total loans secured by 1-4 family residential properties past due 90 days or more still accruing interest in domestic offices that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv",
            "AON": "alpha"
        },
        {
            "V1": 791,
            "database": "fdic-sdi-data",
            "VarName": "p9ls",
            "ShortDescription": "Lease financing receivables, past due 90+ days",
            "LongDescription": "Total lease financing receivables past due 90 or more days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 237,
            "database": "fdic-sdi-data",
            "VarName": "P9LTOT",
            "ShortDescription": "90+ D P/D Total Loans ñ FDIC Loss Sharing",
            "LongDescription": "Total loans past due 90 days or more and still accruing interest that are covered by FDIC loss-sharing agreements.<br><br>Available as of March 2011 and also as of March 2011 no longer included in Loans Wholly or Partially US Government Guaranteed.",
            "File": "Carrying Amount of Assets Covered by FDIC Loss-Share Agreements.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 790,
            "database": "fdic-sdi-data",
            "VarName": "p9othln",
            "ShortDescription": "Other loans, past due 90+ days",
            "LongDescription": "All other loans past due 90 or more days and still accruing interest.  For institutions with assets of less than $300 million, other loans are included in commercial loans.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 770,
            "database": "fdic-sdi-data",
            "VarName": "p9re",
            "ShortDescription": "Loans secured by real estate, total past due 90+ days",
            "LongDescription": "Total loans secured by real estate past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 776,
            "database": "fdic-sdi-data",
            "VarName": "p9reag",
            "ShortDescription": "Loans secured by farmland, past due 90+ days",
            "LongDescription": "Total farmland loans secured by real estate past due 90 or more days and still accruing interest which are held in domestic offices of the institution.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 774,
            "database": "fdic-sdi-data",
            "VarName": "P9recnfm",
            "ShortDescription": "1-4 family residential construction loans past due 90 days or more",
            "LongDescription": "1-4 family residential construction loans secured by real estate past due 90 days or more and still interest held in domestic offices note: not reported by tfr filers",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 775,
            "database": "fdic-sdi-data",
            "VarName": "p9recnot",
            "ShortDescription": "Other construction, all land development and other land loans past due 90+ days",
            "LongDescription": "Other construction and all land development and other land loans secured by real estate past due 90 or more days and still accruing interest in domestic offices note: 1) not reported by tfr filers 2) data begins in 2007",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 773,
            "database": "fdic-sdi-data",
            "VarName": "p9recons",
            "ShortDescription": "Construction and land development, past due 90+ days",
            "LongDescription": "Total construction and land development loans secured by real estate past due 90 or more days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 779,
            "database": "fdic-sdi-data",
            "VarName": "p9refor",
            "ShortDescription": "Real estate loans in foreign offices, past due 90+ days",
            "LongDescription": "Total loans in foreign offices of the institution that are secured by real estate and are past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 741,
            "database": "fdic-sdi-data",
            "VarName": "p9reloc",
            "ShortDescription": "Past due 90+ days  home equity lines of credit",
            "LongDescription": "Total revolving, open-end loans secured by 1-4 family residential properties and extended under lines of credit past due 90 or more days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due 90+ Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 777,
            "database": "fdic-sdi-data",
            "VarName": "p9remult",
            "ShortDescription": "Secured by multifamily residential properties, past due 90+ days",
            "LongDescription": "Total multifamily (5 dwelling units or more) loans secured by real estate past due 90 or more days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 778,
            "database": "fdic-sdi-data",
            "VarName": "p9renres",
            "ShortDescription": "Loans secured by nonfarm nonresidential properties, past due 90+ days",
            "LongDescription": "Total nonfarm, nonresidential loans secured by real estate past due 90 or more days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 771,
            "database": "fdic-sdi-data",
            "VarName": "p9renus",
            "ShortDescription": "Loans to non-U.S. addressees, past due 90+ days",
            "LongDescription": "Total loans secured by real estate (to non-U.S. addressees) past due 90 or more days and still accruing interest.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 738,
            "database": "fdic-sdi-data",
            "VarName": "p9reres",
            "ShortDescription": "Secured by 1-4 family residential properties, past due 90+ days",
            "LongDescription": "Total loans secured by 1-4 family residential properties past due 90 or more days and still accruing interest which are held in domestic offices of the institution.",
            "File": "Nontransaction Accounts.csv; Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 740,
            "database": "fdic-sdi-data",
            "VarName": "P9RERSF2",
            "ShortDescription": "Past due 90+ days secured  by 1-4 Family junior liens",
            "LongDescription": "Closed-end loans secured by junior liens on 1-4 family residential properties that are held in domestic office and are 90 days or more past due and still accruing interest.",
            "File": "Past Due 90+ Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 739,
            "database": "fdic-sdi-data",
            "VarName": "P9RERSFM",
            "ShortDescription": "Past due 90+ days secured  by 1-4 Family first liens",
            "LongDescription": "Closed-end loans secured by first liens on 1-4 family residential properties that are held in domestic office and are 90 days or more past due and still accruing interest.",
            "File": "Past Due 90+ Days 1-4 Family Residential.csv",
            "AON": "numeric"
        },
        {
            "V1": 553,
            "database": "fdic-sdi-data",
            "VarName": "P9RSCI",
            "ShortDescription": "Restructured C&I Loans 90+ Days P/D",
            "LongDescription": "Restructured commercial and industrial loans past due 90 days or more and still accruing interest. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 550,
            "database": "fdic-sdi-data",
            "VarName": "P9RSCONS",
            "ShortDescription": "Restructured Construction loans 90+ days P/D",
            "LongDescription": "Total restructured construction, land development and other land loans secured by real estate past due 90 days or more and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 548,
            "database": "fdic-sdi-data",
            "VarName": "P9RSLNFM",
            "ShortDescription": "Restructured Loans- 1-4 Family 90+ Days P/D",
            "LongDescription": "Restructured loans secured by 1-4 family residential properties past due 90 or more days and still accruing interest in domestic offices. available as of march 2008",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 549,
            "database": "fdic-sdi-data",
            "VarName": "P9RSLNLS",
            "ShortDescription": "Restructured loans and leases, past due 90+ days",
            "LongDescription": "Total restructured loans and lease financing receivables past due 90 or more days and still accruing interest. prior to 2004, this item is not available for TFR Reporters.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 547,
            "database": "fdic-sdi-data",
            "VarName": "P9RSLNLT",
            "ShortDescription": "Total restructured loans 90+ days P/D",
            "LongDescription": "Total restructured loans past due 90 days or more and still accruing interest. <br><br>Note: Prior to March 2011, excludes loans to individuals for household, family and other personal expenditures for call report filers.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 551,
            "database": "fdic-sdi-data",
            "VarName": "P9RSMULT",
            "ShortDescription": "Restructured Multifamily 90+ Days P/D",
            "LongDescription": "Restructured loans on multifamily (5 or more) residential properties secured by real estate past due 90 days or more and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 552,
            "database": "fdic-sdi-data",
            "VarName": "P9RSNRES",
            "ShortDescription": "Restructured Nonfarm Nonresidential Loans 90+ Days P/D",
            "LongDescription": "Total restructured loans secured by nonfarm nonresidential properties past due 90 days or more and still accruing interest in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 554,
            "database": "fdic-sdi-data",
            "VarName": "P9RSOTH",
            "ShortDescription": "Restructured All Other Loans 90+ Days P/D",
            "LongDescription": "Restructured all other loans (including loans to individuals for household, family and other personal expenditures) past due 90 days or more and still accruing interest. Note: this item also includes loans secured by farmland in domestic offices, loans to depository institutions and acceptances of other banks, loans to finance agricultural production and other loans to farmers, loans to individuals for household, family and other personal expenditures, loans to foreign governments and official institutions, loans secured by real estate in foreign offices and other loans. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 792,
            "database": "fdic-sdi-data",
            "VarName": "p9scdebt",
            "ShortDescription": "Debt securities and other assets, past due 90+ days",
            "LongDescription": "Total debt securities and other assets (excludes other real estate owned and other repossessed assets) past due 90 or more days and still accruing interest.  This item is not available for TFR Reporters.",
            "File": "Past Due and Nonaccrual Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 322,
            "database": "fdic-sdi-data",
            "VarName": "parcert",
            "ShortDescription": "Directly owned by another bank (CERT)",
            "LongDescription": "Beginning in March 1997, both the Thrift Financial Reports and Call Reports are completed on a fully consolidated basis.  Previously, the consolidation of subsidiary depository institutions was prohibited.  Now, parent institutions are required to file consolidated reports, while their subsidiary financial institutions are still required to file separate reports.  Select the certificate number to identify the parent bank or thrift.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 1046,
            "database": "fdic-sdi-data",
            "VarName": "partacqu",
            "ShortDescription": "Acquired by reporting bank",
            "LongDescription": "Participations in acceptances acquired by the reporting (nonaccepting) bank that are outstanding.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1045,
            "database": "fdic-sdi-data",
            "VarName": "partconv",
            "ShortDescription": "Conveyed to others by reporting bank",
            "LongDescription": "Participations in acceptances conveyed to others by the institution that are outstanding. not reported as of march 2006",
            "File": "Total Unused Commitments.csv",
            "AON": "alpha"
        },
        {
            "V1": 81,
            "database": "fdic-sdi-data",
            "VarName": "period1",
            "ShortDescription": "Information as of",
            "LongDescription": "The financial information date selected from the drop-down box will generate data for the period ending on that date.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 406,
            "database": "fdic-sdi-data",
            "VarName": "Period1",
            "ShortDescription": "Information as of",
            "LongDescription": "The financial information date selected from the drop-down box will generate data for the period ending on that date.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv; Find an Institution.csv",
            "AON": "alpha"
        },
        {
            "V1": 829,
            "database": "fdic-sdi-data",
            "VarName": "Pgretrv",
            "ShortDescription": "Retrieve Custom Peer Groups",
            "LongDescription": "To retrieve custom peer groups:   1.  Retrieve to Column -- by selecting the column(s) in which to analyze the peer group(s).  Then press:  2. Retrieve Peer Group(s)  3. Confirm Retrieval or Next to continue processing",
            "File": "Peer Group Retrieve Save Delete.csv",
            "AON": "alpha"
        },
        {
            "V1": 830,
            "database": "fdic-sdi-data",
            "VarName": "Pgsavdel",
            "ShortDescription": "Custom Peer Group Save/ Custom Peer Group Delete",
            "LongDescription": "This is the save/delete page.  You can save any current custom peer groups that exist.  Click inside the check box next to the column(s) where the peer group(s) reside, give your custom peer group a name (optional), and select the Save Peer Group(s) button to save.   To delete a saved peer group(s):  Left click inside check box(es) next to the peer group(s) you wish to delete.  Select Delete.",
            "File": "Peer Group Retrieve Save Delete.csv",
            "AON": "alpha"
        },
        {
            "V1": 319,
            "database": "fdic-sdi-data",
            "VarName": "procdate",
            "ShortDescription": "Last Structure Change Process Date",
            "LongDescription": "A date field indicating the date that a change to this record was processed. Standard format = 'CCYYMMDD' (Length = 8) which has been converted to Month, Day, Year format for display purposes.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 96,
            "database": "fdic-sdi-data",
            "VarName": "qbprcoml",
            "ShortDescription": "Quarterly Banking Profile Commercial Bank Region",
            "LongDescription": "The Quarterly Banking Profile (QBP) Commercial Bank Region in which the institution is physically located. Select from a drop down box. regional breakdown. group data by qbp region is only available for insured commercial banks and insured savings institutions and NOT All Insured Institutions, Insured Commercial Banks by asset size and Insured Savings Institutions by asset size.",
            "File": "Additional Option.csv",
            "AON": "alpha"
        },
        {
            "V1": 327,
            "database": "fdic-sdi-data",
            "VarName": "QBPRComl",
            "ShortDescription": "Quarterly Banking Profile Commercial Bank Region",
            "LongDescription": "The Quarterly Banking Profile (QBP) Commercial Bank Region in which the institution is physically located. Select from a drop down box. regional breakdown. group data by qbp region is only available for insured commercial banks and insured savings institutions and NOT All Insured Institutions, Insured Commercial Banks by asset size and Insured Savings Institutions by asset size.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 673,
            "database": "fdic-sdi-data",
            "VarName": "RB2LNRES",
            "ShortDescription": "Allowance for loan and lease losses in tier 2",
            "LongDescription": "Allowance for loan and lease losses that is included in Tier 2 Capital.  Available for <a href='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'>TFR Reporters</a> as of 1990 and <a href='definitions.asp?SystemForm=ID&HelpItem=callrpt'>Call Reporters </a> as of 2001.",
            "File": "Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 857,
            "database": "fdic-sdi-data",
            "VarName": "rbc1aaj",
            "ShortDescription": "Core capital (leverage) ratio",
            "LongDescription": "Tier 1 (core) capital as a percent of average total assets minus ineligible intangibles.   Tier 1 (core) capital includes: common equity plus noncumulative perpetual preferred stock plus minority interests in consolidated subsidiaries less goodwill and other ineligible intangible assets. The amount of eligible intangibles (including mortgage servicing rights) included in core capital is limited in accordance with supervisory capital regulations. Average total assets used in this computation are an average of daily or weekly figures for the quarter.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 858,
            "database": "fdic-sdi-data",
            "VarName": "rbc1rwaj",
            "ShortDescription": "Tier 1 risk-based capital ratio",
            "LongDescription": "Tier 1 (core) capital as a percent of risk-weighted assets as defined by the appropriate federal regulator for prompt corrective action during that time period.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 859,
            "database": "fdic-sdi-data",
            "VarName": "rbcrwaj",
            "ShortDescription": "Total risk-based capital ratio",
            "LongDescription": "Total risk based capital as a percent of risk-weighted assets as defined by the appropriate federal regulator for prompt corrective action during that time period. As of March 2014, Advanced Approaches Institutions began reporting regulatory capital according to the amended Market Risk Capital Rule. (see: FDIC Financial Institutions Letter FIL-24-1012)",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 166,
            "database": "fdic-sdi-data",
            "VarName": "RBCT1J",
            "ShortDescription": "Tier one (core) capital",
            "LongDescription": "Tier 1 (core) capital includes: common equity plus noncumulative perpetual preferred stock plus minority interests in consolidated subsidiaries less goodwill and other ineligible intangible assets. The amount of eligible intangibles (including mortgage servicing rights) included in core capital is limited in accordance with supervisory capital regulations.<br><br>As of March 2014, Advanced Approaches Institutions began reporting regulatory capital according to the amended Market Risk Capital Rule. (see: FDIC Financial Institutions Letter FIL-24-1012)",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 167,
            "database": "fdic-sdi-data",
            "VarName": "RBCT2",
            "ShortDescription": "Tier 2 Risk-based capital",
            "LongDescription": "Risk-based capital-tier 2 is based on the risk-based capital definitions for prompt corrective action (PCA). includible tier 2 capital components consist of, but are not limited to, limited subordinated debt, cumulative perpetual preferred stock, allowance for loan and lease losses, total mandatory convertible debt and a portion of unrealized gains on available-for-sale equity securities. The maximum amount of supplementary capital elements that qualify as Tier 2 capital is limited to 100 percent of Tier 1 capital. In addition, the combined maximum amount of subordinated debt and intermediate-term preferred stock that qualifies as Tier 2 capital is limited to 50 percent of Tier 1 capital.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 325,
            "database": "fdic-sdi-data",
            "VarName": "RegAgnt",
            "ShortDescription": "Regulator",
            "LongDescription": "There are four Federal regulators of banks and savings and loan institutions: federal deposit insurance corporation (fdic) - primary federal regulator responsible for state-chartered banks not members of the Federal Reserve System, state chartered savings banks and as of July 21, 2011, state chartered thrifts. Federal Reserve Board (FRB) - Primary Federal regulator responsible for state-chartered commercial bank members of the Federal Reserve System. Office of the Comptroller of the Currency (OCC) - Primary Federal regulator responsible for nationally chartered commercial banks, and as of July 21, 2011, federally chartered thrifts. Office of Thrift Supervision (OTS) - Prior to July 21, 2011, primary Federal regulator responsible for federally chartered savings and loan associations, federal savings banks and state-chartered savings and loan associations. FDIC insured depository institutions are members of the Deposit Insurance Fund (DIF).",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 938,
            "database": "fdic-sdi-data",
            "VarName": "repopurf",
            "ShortDescription": "Reverse repo agreements purchased - foreign offices",
            "LongDescription": "Securities sold under agreements to repurchase held in foreign offices. Available starting in 2002.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 957,
            "database": "fdic-sdi-data",
            "VarName": "reposldf",
            "ShortDescription": "Reverse repo agreements sold - foreign offices",
            "LongDescription": "Securities purchased under agreements to resell held in foreign offices. Available starting in 2002.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 840,
            "database": "fdic-sdi-data",
            "VarName": "roa",
            "ShortDescription": "Return on assets (ROA)",
            "LongDescription": "Net income after taxes and extraordinary items (annualized) as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a>.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 841,
            "database": "fdic-sdi-data",
            "VarName": "roaptx",
            "ShortDescription": "Pretax return on assets",
            "LongDescription": "Annualized pre-tax net income as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=asset5'> average total assets</a>.<P>Note: Includes extraordinary items and other adjustments, net of taxes.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 842,
            "database": "fdic-sdi-data",
            "VarName": "roe",
            "ShortDescription": "Return on Equity (ROE)",
            "LongDescription": "Annualized net income as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=eq5'> average total equity</a> on a consolidated basis.     Note: If retained earnings are  negative, the ratio is shown as NA.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 843,
            "database": "fdic-sdi-data",
            "VarName": "roeinjr",
            "ShortDescription": "Retained earnings to average equity (ytd only)",
            "LongDescription": "Net income (year-to-date, annualized), less cash dividends declared (year-to-date, annualized), as a percent of <a href='definitions.asp?SystemForm=ID&HelpItem=eq5'> average total equity</a> capital.  If retained earnings are negative, the ratio is shown as NA. This ratio is presented on a year-to-date basis only.",
            "File": "Performance and Condition Ratios.csv",
            "AON": "numeric"
        },
        {
            "V1": 537,
            "database": "fdic-sdi-data",
            "VarName": "RSCI",
            "ShortDescription": "C&I loans restructured and in compliance",
            "LongDescription": "Commercial and industrial loans restructured and in compliance with modified terms on a consolidated basis. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 534,
            "database": "fdic-sdi-data",
            "VarName": "RSCONS",
            "ShortDescription": "Construction loans restructured and in compliance",
            "LongDescription": "Total construction, land development and other land loans secured by real estate which are restructured and in compliance with modified terms in domestic offices.<br><br> Available as of March 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 533,
            "database": "fdic-sdi-data",
            "VarName": "rslnls",
            "ShortDescription": "Non 1-4 family restructured loans & leases",
            "LongDescription": "Loans and lease financing receivables, other then 1-4 family, restructured and in compliance with modified terms on a consolidated basis. notes: (1) excludes loans secured by 1-4 family properties in domestic offices and loans to individuals for household, family and other personal expenditures for CALL report filers. (2) Listed as memoranda only and is included in loans and leases, gross. (3) For TFR filers, includes restructured real estate held for investment.",
            "File": "Loan Charge-Offs and Recoveries.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 531,
            "database": "fdic-sdi-data",
            "VarName": "rslnltot",
            "ShortDescription": "Restructured Loans & leases",
            "LongDescription": "Total loans and leases restructured and in compliance with modified terms. note: beginning march 2008, includes loans secured by 1-4 family residential properties for CALL report filers",
            "File": "Loan Charge-Offs and Recoveries.csv; Net Loans and Leases.csv",
            "AON": "numeric"
        },
        {
            "V1": 532,
            "database": "fdic-sdi-data",
            "VarName": "rslnrefm",
            "ShortDescription": "1-4 Family loans restructured and in compliance",
            "LongDescription": "Loans secured by 1-4 family residential properties in domestic offices which are restructured and in compliancewith the modified terms.<br><br>Available for Call reporters as of March 2008 and TFR reporters as of March 2011.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "numeric"
        },
        {
            "V1": 535,
            "database": "fdic-sdi-data",
            "VarName": "RSMULT",
            "ShortDescription": "Multifamily loans restructured and in compliance",
            "LongDescription": "Loans secured by multifamily (5 or more) residential properties which are restructured and in compliance with modified terms in domestic offices.<br><br> Available as of March 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 536,
            "database": "fdic-sdi-data",
            "VarName": "RSNRES",
            "ShortDescription": "Nonfarm nonresidential loans restructured and in compliance",
            "LongDescription": "Total loans secured by nonfarm nonresidential properties which are restructured and in compliance with modified terms in domestic offices. available as of march 2011",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 538,
            "database": "fdic-sdi-data",
            "VarName": "RSOTHER",
            "ShortDescription": "All Other loans restructured and in compliance",
            "LongDescription": "All other loans (includes loans to individuals for household, family, and other personal expenditures) restructured and in compliance with modified terms. <br><br>Beginning in March 2011, this item includes loans secured by farmland in domestic offices, loans to depository institutions and acceptances of other banks, loans to finance agricultural production and other loans to farmers, loans to individuals for household, family and other personal expenditures, loans to foreign governments and official institutions, loans secured by real estate in foreign offices and other loans.",
            "File": "Loans Restructured in Troubled Debt Restructurings.csv",
            "AON": "alpha"
        },
        {
            "V1": 401,
            "database": "fdic-sdi-data",
            "VarName": "RSSDID",
            "ShortDescription": "Federal Reserve ID Number",
            "LongDescription": "A unique number assigned by the Federal Reserve Board as the entity's unique identifier (RSSDID) for the Regulatory top holder. note: information on bank holding companies is only as of quarter-end.regulatory top holder is any company that directly or indirectly owns, controls or has power to vote 25 percent or more of a bank's or direct holding company's shares or controls in any manner the election of a majority of the directors or trustees of a bank or direct holding company or exercises a controlling influence over the management or policies of a bank or direct holding company. Information on Thrift Holding Companies that own Savings Associations but do not own banks is not currently available in the ID System. Source: Federal Reserve Board National Information Center data base.",
            "File": "Find a Bank Holding Company.csv",
            "AON": "alpha"
        },
        {
            "V1": 362,
            "database": "fdic-sdi-data",
            "VarName": "rt",
            "ShortDescription": "Interest rate contracts",
            "LongDescription": "Notional amount of all interest rate contracts.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 364,
            "database": "fdic-sdi-data",
            "VarName": "rtffc",
            "ShortDescription": "Futures and forward contracts",
            "LongDescription": "Futures and forward interest rate contracts (gross amounts) in which the predominent risk characteristic is interest rate risk.  These contracts represent agreements for delayed delivery of financial instruments or commodities in which the buyer agrees to purchase and the seller agrees to deliver, at a specified future date, a specified instrument or commodity at a specified price or yield.  Futures contracts are standardized and are traded on organized exchanges that act as the counterpart to each contract.  Forward contracts are not traded on organized exchanges and their contractual terms are not standardized.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 363,
            "database": "fdic-sdi-data",
            "VarName": "rtnvs",
            "ShortDescription": "Notional value of interest rate swaps",
            "LongDescription": "The notional amount of all outstanding interest rate and basis swaps whose predominent characteristic is interest rate risk.  The notional amount is the underlying principal amount upon which the exchange of interest is based.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 366,
            "database": "fdic-sdi-data",
            "VarName": "rtpoc",
            "ShortDescription": "Purchased option contracts",
            "LongDescription": "The par value of a financial instrument underlying a futures contract whose underlying risk characteristic is interest rate risk.  Also included are contracts known as caps, floors, collars, corridors, and swaptions.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 365,
            "database": "fdic-sdi-data",
            "VarName": "rtwoc",
            "ShortDescription": "Written option contracts",
            "LongDescription": "Written option interest rate contracts (gross amounts) that the reporting institution has obligated itself to either purchase or sell that are outstanding as of the report date.  It includes both written exchange-traded and written over-the-counter (OTC) interest rate options.  Exchange-traded option contracts obligate the reporting institution to either purchase or sell an interest rate futures contract whose predominant risk characteristic is interest rate risk.  OTC interest rate options include options to purchase and sell interest bearing financial instruments whose predominant risk characteristic is interest rate risk as well as contracts known as caps, floors, collars, corridors, and swaptions.",
            "File": "Derivatives.csv",
            "AON": "numeric"
        },
        {
            "V1": 155,
            "database": "fdic-sdi-data",
            "VarName": "RWAJT",
            "ShortDescription": "Total risk weighted assets adjusted",
            "LongDescription": "Total risk weighted assets are assets adjusted for risk-based capital definitions which include on-balance-sheet as well as off-balance-sheet items multiplied by risk-weights that range from zero to 200 percent. A conversion factor is used to assign a balance sheet equivalent amount for selected off-balance-sheet accounts. <br><br>As of March 2014, Advanced Approaches Institutions began reporting regulatory capital according to the amended Market Risk Capital Rule. (see: FDIC Financial Institutions Letter FIL-24-1012 and CALL schedule RC-R part 1B). Beginning March 2015, all institutions will follow the same rule and reporting requirements. <br><br>RIS data note: Prior to March 2014, this variable is the same as RIS variable RWAJ",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 121,
            "database": "fdic-sdi-data",
            "VarName": "sc",
            "ShortDescription": "Total securities",
            "LongDescription": "Total investment securities (excludes securities held in trading accounts). The full implementation of FASB 115 became effective as of January 1, 1994. Beginning on that date, a portion of banks' securities portfolios are reported based upon fair (market) values;previously, all securities not held in trading accounts were reported at either amortized cost or the lower of cost or market. A negative Total Securities indicates a TFR Reporters. with assets held in trading accounts exceeding total securities.",
            "File": "Assets and Liabilities.csv; Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 976,
            "database": "fdic-sdi-data",
            "VarName": "sc1les",
            "ShortDescription": "With remaining maturity of one year or less",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity of one year or less.  Held-to-maturity debt securities are reported at amortized cost.  Available-for-sale debt securities are reported at fair value.  This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 870,
            "database": "fdic-sdi-data",
            "VarName": "scabs",
            "ShortDescription": "Asset backed securities",
            "LongDescription": "The amortized cost of held-to-maturity and the fair value of available-for-sale for all asset-backed securities (other than mortgage-backed securities), including asset-backed commercial paper, not held for trading. Prior to 2001, asset backed securities are included in ìOther domestic debt securitiesî for those institutions that file a FFIEC Call Report.     This item is not available for TFR Reporters",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 889,
            "database": "fdic-sdi-data",
            "VarName": "scaf",
            "ShortDescription": "Available-for-sale securities (fair market value)",
            "LongDescription": "Total securities designated as available-for-sale, reported at fair (market) value.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 865,
            "database": "fdic-sdi-data",
            "VarName": "scage",
            "ShortDescription": "U.S. Government agency obligations",
            "LongDescription": "The amortized cost and fair value of all U.S. Government agency obligations not held for trading. Excludes commercial mortgage-backed securities as of June 2009. for tfr reporters, this includes the aforementioned securities held in trading accounts, u.s. treasury securities, and mortgage derivatives securities.",
            "File": "Past Due and Nonaccrual Assets.csv; U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 1059,
            "database": "fdic-sdi-data",
            "VarName": "scaot",
            "ShortDescription": "U.S. government agencies",
            "LongDescription": "U.S. government agency and corporation obligations (excluding mortgage-backed securities) issued by U.S. government agencies held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis. Prior to 1994, this item was reported on a domestic basis.   This item is not available for TFR Reporters",
            "File": "U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 869,
            "database": "fdic-sdi-data",
            "VarName": "sccmmb",
            "ShortDescription": "Commercial mortgage-backed securities - Total",
            "LongDescription": "Total commercial mortgage-backed securities on a consolidated basis.<BR><BR><b>Note:</b> Data begins in June 2009.This item is not available for </FONT><A HREF='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'><FONT FACE='Helvetica' SIZE=2>TFR Reporters</FONT></A><FONT FACE='Helvetica' SIZE=2>.<br><br>Modification starting March 2011:  SCCMMB= SUM (SCCMMB,-SCCPTG,-SCCMOG)",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1064,
            "database": "fdic-sdi-data",
            "VarName": "SCCMOG",
            "ShortDescription": "Other commercial MBS Issued or guaranteed by US Govrnmnt agencies or sponsored",
            "LongDescription": "Other commercial mortgage-backed securities issued or guaranteed by U.S. Government agencies or sponsored agencies - the amortized cost and fair value of all CMOs, REMICs, CMO and REMIC residuals, stripped mortgage-backed securities, and commercial paper backed by loans secured by properties other than 1-4 family residential properties that have been issued by U.S. Government agencies or U.S. Government-sponsored agencies. TFR Reporters.",
            "File": "U.S. Government Obligations.csv",
            "AON": "alpha"
        },
        {
            "V1": 887,
            "database": "fdic-sdi-data",
            "VarName": "sccmot",
            "ShortDescription": "Other commercial mortgage-backed securities",
            "LongDescription": "Other commercial mortgage-backed securities (issued by U.S. government-sponsored agencies or by others) on a consolidated basis note: data back to 2009",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 886,
            "database": "fdic-sdi-data",
            "VarName": "sccmpt",
            "ShortDescription": "Commercial mortgage pass-through securities",
            "LongDescription": "Commercial mortgage pass-through securities (issued by U.S. government-sponsored agencies or by others) on a consolidated basis<BR><BR><b>Note:</b> Data begins in June 2009",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 883,
            "database": "fdic-sdi-data",
            "VarName": "sccol",
            "ShortDescription": "CMOs issued by government agencies or sponsored agencies",
            "LongDescription": "Mortgage-backed securities ñ Collateralized Mortgage Obligations. The amortized cost and fair value of all classes of CMOs and REMICs, CMO and REMIC residuals, and stripped mortgage-backed securities issued or guaranteed by U.S. Government agencies or U.S. Government-sponsored agencies that are backed by loans secured by 1-4 family residential properties. Also includes REMICs issued by the U.S. Department of Veterans Affairs (VA) that are backed by 1-4 family residential mortgages in this item. Includes privately issued CMOs and REMICS (including securities held in trading accounts) for tfr reporters. u.s. government agencies include, but are not limited to, such agencies as the government national mortgage association (gnma), the federal deposit insurance corporation (fdic), and the national credit union administration (ncua). u.s. government-sponsored agencies include, but are not limited to, such agencies as the federal home loan mortgage corporation (fhlmc) and the federal national mortgage association (fnma). beginning january 1, 1994, this item consists of both securities designated as held-to-maturity, reported at amortized cost, and securities designated as available-for-sale, reported at fair market value.",
            "File": "Performance and Condition Ratios.csv; U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 1063,
            "database": "fdic-sdi-data",
            "VarName": "SCCPTG",
            "ShortDescription": "Commercial mortgage pass-through securities ñ FNMA, FHLMC, or GNMA",
            "LongDescription": "Commercial mortgage pass-through securities issued or guaranteed by FNMA, FHLMC, or GNMA held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis. note: data begins in march 2011 and is not available for tfr reporters.",
            "File": "U.S. Government Obligations.csv",
            "AON": "alpha"
        },
        {
            "V1": 867,
            "database": "fdic-sdi-data",
            "VarName": "SCDOMO",
            "ShortDescription": "Other domestic debt securities",
            "LongDescription": "Total other domestic debt securities.  For TFR Reporters, this item includes securities held in trading accounts but excludes privately-issued collateralized mortgage obligations (including REMICs).  Institutions with less than $100 million in total assets include 'foreign debt securities' in 'other domestic debt securities'.  Includes securities held in trading accounts for TFR reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 874,
            "database": "fdic-sdi-data",
            "VarName": "sceq",
            "ShortDescription": "Equity securities",
            "LongDescription": "Total equity securities available-for-sale at fair value not held in trading.  This item includes securities held in trading accounts for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1061,
            "database": "fdic-sdi-data",
            "VarName": "scfmn",
            "ShortDescription": "Issued by F.N.M.A. and F.H.L.M.C.",
            "LongDescription": "Mortgage-backed pass-through securities issued by FNMA and FHLMC held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis. Beginning January 1, 1994, this item consists of both securities designated as held-to-maturity, reported at amortized cost, and securities designated as available-for-sale, reported at fair market value   This item is not available for TFR Reporters",
            "File": "U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 873,
            "database": "fdic-sdi-data",
            "VarName": "scford",
            "ShortDescription": "Foreign debt securities",
            "LongDescription": "Total of all foreign debt securities held-to-maturity at amortized cost and available-for-sale at fair value.  Prior to 2001, institutions that filed a FFIEC Call Report and had less than less than $100 million in total assets included 'foreign debt securities' in 'other domestic debt securities'.    This item is not available for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1062,
            "database": "fdic-sdi-data",
            "VarName": "scgnm",
            "ShortDescription": "Issued by G.N.M.A.",
            "LongDescription": "Mortgage-backed pass-through securities guaranteed by GNMA held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis. Beginning January 1, 1994, this item consists of both securities designated as held-to-maturity, reported at amortized cost, and securities designated as available-for-sale, reported at fair market value.   This item is not available for TFR Reporters",
            "File": "U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 880,
            "database": "fdic-sdi-data",
            "VarName": "scgty",
            "ShortDescription": "Issued or guaranteed by U.S.",
            "LongDescription": "Mortgage-backed pass-through securities held-to-maturity at amortized cost and available-for-sale at fair value, which are issued or guaranteed through FNMA, FHLMC, or GNMA.  This includes securities held in trading accounts for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 888,
            "database": "fdic-sdi-data",
            "VarName": "scha",
            "ShortDescription": "Held to maturity securities (book value)",
            "LongDescription": "Total securities designated to be held to maturity, reported at amortized cost (book value).",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1043,
            "database": "fdic-sdi-data",
            "VarName": "sclent",
            "ShortDescription": "Securities lent",
            "LongDescription": "Either the book value of securities lent on both a collateralized and uncollateralized basis or the market value of customers' securities lent, where the customer is indemnified against loss by the institution.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 878,
            "database": "fdic-sdi-data",
            "VarName": "scmtgbk",
            "ShortDescription": "Mortgage-backed securities",
            "LongDescription": "Mortgage-backed securities include:     US Government agency and corporation issued obligations or guaranteed certificates of participation in pools of residential mortgages.  US Government agency and corporation obligations and collateralized mortgage obligations issued by the Federal National Mortgage Association and the Federal Home Loan Mortgage Corporation (including real estate mortgage investment conduits - REMICS).  Other domestic debt private securities - (i.e., non-government issued or guaranteed) and certificates of participation in pools of residential mortgages.  Other domestic debt securities that are privately issued and collateralized mortgage obligations (including REMICS). Effective March 1994, the full implementation of FASB 115 states that a portion of banks' mortgage-backed securities portfolio is now reported based upon fair (market) values; previously, all mortgage-backed securities not held in trading accounts were reported at either amortized cost or lower of cost or market.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 866,
            "database": "fdic-sdi-data",
            "VarName": "scmuni",
            "ShortDescription": "Securities issued by states & political subdivisions",
            "LongDescription": "The amortized cost and fair value of all securities issued by states and political subdivisions in the U.S. not held for trading.  Includes securities held in trading accounts for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 972,
            "database": "fdic-sdi-data",
            "VarName": "scnm1t3",
            "ShortDescription": "Over one year through three years",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of over one year through three years.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 970,
            "database": "fdic-sdi-data",
            "VarName": "scnm3les",
            "ShortDescription": "Three months or less",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of three months or less.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.     This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 971,
            "database": "fdic-sdi-data",
            "VarName": "scnm3t12",
            "ShortDescription": "Over three months through twelve months",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of over three months through twelve months.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 973,
            "database": "fdic-sdi-data",
            "VarName": "scnm3t5",
            "ShortDescription": "Over three years through five years",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of over three years through five years.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 974,
            "database": "fdic-sdi-data",
            "VarName": "scnm5t15",
            "ShortDescription": "Over five years through fifteen years",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of over five years through fifteen years.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 975,
            "database": "fdic-sdi-data",
            "VarName": "scnmov15",
            "ShortDescription": "Over fifteen years",
            "LongDescription": "Fixed and floating rate debt securities with a remaining maturity or next repricing date of over fifteen years.  This includes securities that are issued by the U.S. Treasury, U.S. government agencies, and states and political subdivisions; other non-mortgage debt securities, and mortgage pass-through securities other than those backed by closed-end first lien 1-4 family residential mortgages. This excludes debt securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 968,
            "database": "fdic-sdi-data",
            "VarName": "sco3yles",
            "ShortDescription": "Three years or less",
            "LongDescription": "Other mortgage-backed securities (CMOs, REMICs, and stripped MBS) with an expected average life of three years or less.  This includes both fixed rate and floating rate securities.  Held-to-maturity securities are reported at amortized cost.  Available-for-sale securities are reported at fair value.  This excludes all mortgage pass-through securities and securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 872,
            "database": "fdic-sdi-data",
            "VarName": "scodot",
            "ShortDescription": "Other domestic debt securities - All other",
            "LongDescription": "Other domestic debt securities - all other held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis note: 1) for call filers prior to march 2001 included abs 2) for tfr filers from march 2004, other investment securities exclude securities backed by nonmortgage loans (abs) - prior to march 2004 these two items were reported together in one item 3) For TFR filers prior to 3/2004 includes the aforementioned securities held in trading accounts",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 881,
            "database": "fdic-sdi-data",
            "VarName": "scodpc",
            "ShortDescription": "Privately issued",
            "LongDescription": "Mortgage-backed pass-through securities held-to-maturity at amortized cost and available-for-sale at fair value, which are privately-issued.  This includes securities held in trading accounts for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 884,
            "database": "fdic-sdi-data",
            "VarName": "scodpi",
            "ShortDescription": "Privately issued",
            "LongDescription": "Mortgage-backed securities (CMOs and REMICs) held-to-maturity at amortized cost and available-for-sale at fair value, which are privately-issued and collateralized by mortgage-backed securities issued or guaranteed by government agencies or sponsored agencies and all other privately-issued securities. this item is not available for tfr reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 969,
            "database": "fdic-sdi-data",
            "VarName": "scoov3y",
            "ShortDescription": "Over three years",
            "LongDescription": "Other mortgage-backed securities (CMOs, REMICs, and stripped MBS) with an expected average life of over three years.  Held-to-maturity securities are reported at amortized cost.  Available-for-sale securities are reported at fair value.  This excludes all mortgage pass-through securities and securities that are in nonaccrual status.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 877,
            "database": "fdic-sdi-data",
            "VarName": "scpledge",
            "ShortDescription": "Pledged securities",
            "LongDescription": "Securities that are pledged to secure deposits, repurchase transactions, or other borrowings.  This includes held-to-maturity securities at amortized cost and available-for-sale securities at fair value.   This item is not available for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 964,
            "database": "fdic-sdi-data",
            "VarName": "scpt1t3",
            "ShortDescription": "Over one year through three years",
            "LongDescription": "Mortgage pass-throughs securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of over one year through three years.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 962,
            "database": "fdic-sdi-data",
            "VarName": "scpt3les",
            "ShortDescription": "Three months or less",
            "LongDescription": "Mortgage pass-through securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of three months or less.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 963,
            "database": "fdic-sdi-data",
            "VarName": "scpt3t12",
            "ShortDescription": "Over three months through twelve months",
            "LongDescription": "Mortgage pass-throughs securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of over three months through twelve months.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 965,
            "database": "fdic-sdi-data",
            "VarName": "scpt3t5",
            "ShortDescription": "Over three years through five years",
            "LongDescription": "Mortgage pass-throughs securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of over three years through five years.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 966,
            "database": "fdic-sdi-data",
            "VarName": "scpt5t15",
            "ShortDescription": "Over five years through fifteen years",
            "LongDescription": "Mortgage pass-throughs securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of over five years through fifteen years.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 967,
            "database": "fdic-sdi-data",
            "VarName": "scptov15",
            "ShortDescription": "Over fifteen years",
            "LongDescription": "Mortgage pass-throughs securities backed by closed-end first lien 1-4 family residential mortgages with a remaining maturity or next repricing date of over fifteen years.  This includes fixed rate and floating rate mortgage pass-through securities.   This item is not available for TFR Reporters.",
            "File": "Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 890,
            "database": "fdic-sdi-data",
            "VarName": "scrdebt",
            "ShortDescription": "Total debt securities",
            "LongDescription": "Total debt securities, both domestic and foreign at amortized cost and fair value, excluding nonaccrual debt securities. <P>For <a href='definitions.asp?SystemForm=ID&HelpItem=tfrrpt'>TFR Reporters</a> this item includes securities held in trading accounts.</P>",
            "File": "Performance and Condition Ratios.csv; Total Debt Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 876,
            "database": "fdic-sdi-data",
            "VarName": "scres",
            "ShortDescription": "General valuation allowances for securities for TFR Reporters",
            "LongDescription": "Prior to 2010, the amount of general valuation allowances for securities for tfr reporters. no longer reported as of march 2010",
            "File": "Securities.csv",
            "AON": "alpha"
        },
        {
            "V1": 871,
            "database": "fdic-sdi-data",
            "VarName": "scsfp",
            "ShortDescription": "Structured financial products - Total",
            "LongDescription": "Total structured financial products (cash, synthetic and hybrid) on a consolidated basis<BR><BR><b>Note:</b> Data begins in June 2009",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 891,
            "database": "fdic-sdi-data",
            "VarName": "scsnhaa",
            "ShortDescription": "Amortized cost",
            "LongDescription": "Amortized cost of structured notes (included in the held-to-maturity and available-for-sale accounts). Structured notes are debt securities that combine straight fixed or variable rate instruments and derivative products that are issued by corporations and government sponsored enterprises including FNMA, the Federal Home Loan Bank and the Federal Home Loan Mortgage Corporation. Structured notes generally contain embedded options such as call options, interest rate caps and interest rate floors. They typically have cash flows that are linked to indices such as interest rates, foreign exchange rates, commodity prices and other financial variables. The cash flows of structured notes can vary in the timing and amount of cash received by the investor throughout the life of the security. This makes the valuation of cash flows and risks of these securities a complex process. prior to 2004, this item is not available for tfr reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 892,
            "database": "fdic-sdi-data",
            "VarName": "scsnhaf",
            "ShortDescription": "Fair value",
            "LongDescription": "Fair value of structured notes (included in the held-to-maturity and available-for-sale accounts).  Structured notes are debt securities that combine straight fixed or variable rate instruments and derivative products that are issued by corporations and government sponsored enterprises including FNMA, the Federal Home Loan Bank and the Federal Home Loan Mortgage Corporation. Structured notes generally contain embedded options such as call options, interest rate caps and interest rate floors. They typically have cash flows that are linked to indices such as interest rates, foreign exchange rates, commodity prices and other financial variables.  The cash flows of structured notes can vary in the timing and amount of cash received by the investor throughout the life of the security. This makes the valuation of cash flows and risks of these securities a complex process.   This item is not available for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1060,
            "database": "fdic-sdi-data",
            "VarName": "scspn",
            "ShortDescription": "Issued by U.S. government enterprises (GSEs)",
            "LongDescription": "U.S. government agency and corporation obligations (excluding mortgage-backed securities) issued by U.S.government-sponsored agencies held-to-maturity at amortized cost and available-for-sale at fair value on a consolidated basis. Beginning January 1, 1994, this item consists of both securities designated as held-to-maturity, reported at amortized cost, and securities designated as available-for-sale, reported at fair market value.   This item is not available for TFR Reporters.",
            "File": "U.S. Government Obligations.csv",
            "AON": "numeric"
        },
        {
            "V1": 863,
            "database": "fdic-sdi-data",
            "VarName": "scus",
            "ShortDescription": "U.S. Government securities",
            "LongDescription": "Total US Treasury securities plus US Government agency and corporation obligations. Beginning January 1, 1994, this item consists of both securities designated as held-to-maturity, reported at amortized cost, and securities designated as available-for-sale, reported at fair market value. Includes US government issued or guaranteed mortgage-backed securities.  Includes securities held in trading accounts for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 864,
            "database": "fdic-sdi-data",
            "VarName": "scust",
            "ShortDescription": "U.S. Treasury securities",
            "LongDescription": "Total U.S. Treasury securities held-to-maturity at amortized cost and available-for-sale at fair value not held in trading accounts.  This item is not reported by TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 312,
            "database": "fdic-sdi-data",
            "VarName": "sod_desc",
            "ShortDescription": "Summary of deposits",
            "LongDescription": "An additional publication that provides deposit information collected in June of each year on branches for both commercial banks and savings institutions.  Available information includes:  National Totals, Deposits by Charter Class  National Totals, Deposits by Asset Size  National Totals, Deposits by Consolidated Metropolitan Statistical Area National Totals, Deposits by Metropolitan Statistical Area State Totals, Deposits by County State Totals, Deposits by Charter Class Market Share Summary by State",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 90,
            "database": "fdic-sdi-data",
            "VarName": "specgrp",
            "ShortDescription": "Asset Concentration Hierarchy",
            "LongDescription": "An indicator of an institutionís primary specialization in terms of asset concentration. note: (groups are hierarchical and mutually exclusive): international Specialization ñ Institutions with assets greater than $10 billion and more than 25 percent of total assets in foreign offices. Agricultural Specialization ñ Banks with agricultural production loans plus real estate loans secured by farmland in excess of 25 percent of total loans and leases. Credit-card Specialization ñ Institutions with credit-card loans plus securitized receivables in excess of 50 percent of total assets plus securitized receivables. Commercial Lending Specialization ñ Institutions with commercial and industrial loans, plus real estate construction and development loans, plus loans secured by commercial real estate properties in excess of 25 percent of total assets. Mortgage Lending Specialization ñ Institutions with residential mortgage loans, plus mortgage-backed securities, in excess of 50 percent of total assets. Consumer Lending Specialization ñ Institutions with residential mortgage loans, plus credit-card loans, plus other loans to individuals, in excess of 50 percent of total assets. Other Specialized $1 Billion ñ Institutions with assets greater than $1 billion that do not meet any of the definitions above, they have significant lending activity with no identified asset concentrations.",
            "File": "Additional Option.csv; Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 304,
            "database": "fdic-sdi-data",
            "VarName": "status",
            "ShortDescription": "Status",
            "LongDescription": "An institution is either Active or Inactive during a quarterly report period. active ñ as of the date, the institution is still conducting business as an FDIC insured institution. Inactive - As of the date, the institution is no longer in business as an FDIC insured institution. Inactive institutions can include, but are not limited to: - institutions that have merged with other institutions - institutions that have been acquired by other institutions - institutions that are no longer in business",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        },
        {
            "V1": 927,
            "database": "fdic-sdi-data",
            "VarName": "StdPG",
            "ShortDescription": "Standard Peer Groups",
            "LongDescription": "Standard Peer Groups - a number of pre-defined and pre-calculated \t\t\tgroups of FDIC-insured institutions. These standard peer groups are used in \t\t\tFDIC publications such as the FDIC's \t\t\t \t\t\tStatistics on Banking. When possible, standard peer groups should be \t\t\tused instead of custom groups for faster processing. The available standard \t\t\tpeer groups are included in the following table:",
            "File": "Standard Peer Group.csv",
            "AON": "alpha"
        },
        {
            "V1": 311,
            "database": "fdic-sdi-data",
            "VarName": "stmult",
            "ShortDescription": "Interstate Branches",
            "LongDescription": "A 'yes' indicates that an institution has branches that can accept FDIC-insured deposits in more than one state. this item is not available (na) for TFR Reporters. The FDIC Act defines state as any State of the United States, the District of Columbia, and any territory of the United States, Puerto Rico, Guam, American Samoa, the Trust Territory of the Pacific Islands, the Virgin Island, and the Northern Mariana Islands.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 314,
            "database": "fdic-sdi-data",
            "VarName": "subchaps",
            "ShortDescription": "Subchapter S Corporations",
            "LongDescription": "The Small Business Job Protection Act of 1996 changed the Internal Revenue Code to allow financial institutions to elect Subchapter S corporation status, beginning in 1997. Banks are required to indicate on the Call Report whether there is currently in effect an election to file under Subchapter S. Thrifts have a similar requirement as of March 1998.  The most important IRS requirements to elect and maintain Subchapter S status are: There can be no more than 75 eligible shareholders and no more than one class of stock. (In general, shareholders can only be individuals, estates, and certain types of trusts. Certain retirement plans and charitable organizations will be eligible in 1998.) All shareholders must consent.  Banks and thrifts converting to Subchapter S status must use the specific charge-off method for tax purposes rather than the reserve method of accounting for bad debts and recapture tax bad debt reserves over a period of six years, if the reserve method had been used prior to conversion. (Note: even though the specific charge-off method is required for tax purposes, an adequate allowance for loan and lease losses must still be maintained on the financial statements and Call Reports.) Banks and thrifts are subject to a built-in gains (BIG) tax, if the aggregate fair market value of assets is greater than their aggregate adjusted bases on the date of conversion to Subchapter S status.     [Banks are required to indicate separately on the Call Report in December of each year, the deferred portion of income taxes reported in net income. For Subchapter S banks, some or all of their deferred tax assets and liabilities may be eliminated upon conversion to Subchapter S status; however, deferred taxes related to the BIG tax and the recapture of bad debt reserves must be recognized.].   A Subchapter S corporation is treated as a pass-through entity, similar to a partnership, for federal income tax purposes. It is generally not subject to any federal income taxes at the corporate level. Its taxable income flows through to its shareholders in proportion to their stock ownership, and the shareholders generally pay federal income taxes on their share of this taxable income. This can have the effect of reducing institutions' reported income tax expense and increasing their after-tax earnings..   The election of Subchapter S status may result in an increase in shareholders' personal tax liabilities. Therefore, S corporations typically increase the amount of earnings distributed as dividends to compensate for higher personal taxes.",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 139,
            "database": "fdic-sdi-data",
            "VarName": "subnd",
            "ShortDescription": "Subordinated debt",
            "LongDescription": "A subordinated note or debenture is a form of debt issued by a bank or a consolidated subsidiary. As of March 1997, includes limited-life preferred stock and related surplus.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 180,
            "database": "fdic-sdi-data",
            "VarName": "SZ30AUTO",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days Auto Loans",
            "LongDescription": "Auto Loans\t30-89 Past Due Loan Amounts Included in Schedule RC-S,\tItem 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 182,
            "database": "fdic-sdi-data",
            "VarName": "SZ30CI",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days C&I Loans",
            "LongDescription": "Commercial & Industrial Loans\t30-89 Past Due Loan Amounts Included in Schedule RC-S,\tItem 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - Commercial & Industrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 181,
            "database": "fdic-sdi-data",
            "VarName": "SZ30CON",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days Other Consumer Loans",
            "LongDescription": "Other Consumer Loans\t30-89 Past Due Loan Amounts Included in Schedule RC-S,\tItem 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - Other Consumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 179,
            "database": "fdic-sdi-data",
            "VarName": "SZ30CRCD",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days Credit Card Receivables",
            "LongDescription": "Credit Card Receivables\t30-89 Past Due Loan Amounts Included in Schedule RC-S,\tItem 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - Credit Card Receivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 178,
            "database": "fdic-sdi-data",
            "VarName": "SZ30HEL",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days Home Equity Lines",
            "LongDescription": "Home Equity Lines30-89 Past Due Loan Amounts Included in Schedule RC-S,Item 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - Home Equity Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 183,
            "database": "fdic-sdi-data",
            "VarName": "SZ30OTH",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All Leases\t30-89 Past Due Loan Amounts Included in Schedule RC-S,\tItem 1, Outstanding Principal Balance Of Securitized AssetAsset Sales - All Other Loans, Other Assets and Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 177,
            "database": "fdic-sdi-data",
            "VarName": "SZ30RES",
            "ShortDescription": "Past Due Loan Amounts 30-89 Days 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential Loans30-89 Past Due Loan Amounts Included In Schedule Rc-S,Item 1, Outstanding Principal Balance Of Securitized AssetSales - 1-4 Family Residential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 187,
            "database": "fdic-sdi-data",
            "VarName": "SZ90AUTO",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More Auto Loans",
            "LongDescription": "Auto LoansPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 189,
            "database": "fdic-sdi-data",
            "VarName": "SZ90CI",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More C&I Loans",
            "LongDescription": "Commercial & Industrial LoansPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - Commercial and Industrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 188,
            "database": "fdic-sdi-data",
            "VarName": "SZ90CON",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More Other Consumer Loans",
            "LongDescription": "Other Consumer LoansPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - Other Consumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 186,
            "database": "fdic-sdi-data",
            "VarName": "SZ90CRCD",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - Credit Cards Receivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 185,
            "database": "fdic-sdi-data",
            "VarName": "SZ90HEL",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More Home Equity Lines",
            "LongDescription": "Home Equity LinesPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - Home Equity Lines.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 190,
            "database": "fdic-sdi-data",
            "VarName": "SZ90OTH",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All LeasesPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - All Other Loans, Other Assets and Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 184,
            "database": "fdic-sdi-data",
            "VarName": "SZ90RES",
            "ShortDescription": "Past Due Loan Amounts 90 Days or More",
            "LongDescription": "1-4 Family Residential LoansPast Due 90 Days Or More Loans Reported in Schedule RC-S,Item 1, Outstanding Principal Balance of Securitized AssetAsset Sales - 1-4 Family Residential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 201,
            "database": "fdic-sdi-data",
            "VarName": "SZCRAUTO",
            "ShortDescription": "Recoveries On Assets Sold and Securitized Auto Loans",
            "LongDescription": "Auto LoansRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 626,
            "database": "fdic-sdi-data",
            "VarName": "SZCRCDFE",
            "ShortDescription": "Outstanding Credit Card Fees and Financial Charges",
            "LongDescription": "Outstanding Credit Card Fees And Finance Charges Included InThe Outstanding Principal Balance Of Credit Card ReceivablesSold And Securitized By The Reporting Bank With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements.",
            "File": "Memoranda.csv",
            "AON": "numeric"
        },
        {
            "V1": 203,
            "database": "fdic-sdi-data",
            "VarName": "SZCRCI",
            "ShortDescription": "Recoveries On Assets Sold and Securitized C&I Loans",
            "LongDescription": "Commercial & Industrial LoansRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - Commercial AndIndustrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 202,
            "database": "fdic-sdi-data",
            "VarName": "SZCRCON",
            "ShortDescription": "Recoveries On Assets Sold and Securitized Other Consumer Loans",
            "LongDescription": "Other Consumer LoansRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - Other Consumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 200,
            "database": "fdic-sdi-data",
            "VarName": "SZCRCRCD",
            "ShortDescription": "Recoveries On Assets Sold and Securitized Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - Credit Card Receivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 199,
            "database": "fdic-sdi-data",
            "VarName": "SZCRHEL",
            "ShortDescription": "Recoveries On Assets Sold and Securitized Home Equity Lines",
            "LongDescription": "Home Equity LinesRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - Home Equity Lines.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 204,
            "database": "fdic-sdi-data",
            "VarName": "SZCROTH",
            "ShortDescription": "Recoveries On Assets Sold and Securitized All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All LeasesRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - All Other Loans, Other Assets and Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 198,
            "database": "fdic-sdi-data",
            "VarName": "SZCRRES",
            "ShortDescription": "Recoveries On Assets Sold and Securitized 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential LoansRecoveries On Assets Sold And Securitized With Servicing Retained Or With Recourse Or Other Seller-Provided CreditEnhancement (Calendar Year-To-Date) - 1-4 FamilyResidential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 194,
            "database": "fdic-sdi-data",
            "VarName": "SZDRAUTO",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized Auto Loans",
            "LongDescription": "Auto LoansCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 196,
            "database": "fdic-sdi-data",
            "VarName": "SZDRCI",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized C&I Loans",
            "LongDescription": "Commercial & Industrial LoansCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - Commercial & Industrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 195,
            "database": "fdic-sdi-data",
            "VarName": "SZDRCON",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized Other Consumer Loans",
            "LongDescription": "Other Consumer LoansCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - Other Consumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 193,
            "database": "fdic-sdi-data",
            "VarName": "SZDRCRCD",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - Credit Card Receivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 192,
            "database": "fdic-sdi-data",
            "VarName": "SZDRHEL",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized Home Equity Lines",
            "LongDescription": "Home Equity LinesCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - Home Equity Lines.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 197,
            "database": "fdic-sdi-data",
            "VarName": "SZDROTH",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All LeasesCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - All Other Loans, Other Assets and Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 191,
            "database": "fdic-sdi-data",
            "VarName": "SZDRRES",
            "ShortDescription": "Charge-Offs On Assets Sold And Securitized 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential LoansCharge-Offs On Assets Sold And Securitized With ServicingRetained Or With Recourse Or Other Seller-Provided CreditEnhancements (Calendar Year-To-Date) - 1-4 FamilyResidential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 585,
            "database": "fdic-sdi-data",
            "VarName": "SZIOAUTO",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest  Auto Loans",
            "LongDescription": "Auto Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)- Auto Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 587,
            "database": "fdic-sdi-data",
            "VarName": "SZIOCI",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest  C&I Loans",
            "LongDescription": "Commercial & Industrial Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)- Commercial And IndustrialLoans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 586,
            "database": "fdic-sdi-data",
            "VarName": "SZIOCON",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest  Other Consumer Loans",
            "LongDescription": "Other Consumer Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)-Other Consumer Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 584,
            "database": "fdic-sdi-data",
            "VarName": "SZIOCRCD",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest Credit Cards Receivables",
            "LongDescription": "Credit Cards Receivables\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)- Credit Card Receivables.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 583,
            "database": "fdic-sdi-data",
            "VarName": "SZIOHEL",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest Home Equity Lines",
            "LongDescription": "Home Equity Lines\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)- Home Equity Lines.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 588,
            "database": "fdic-sdi-data",
            "VarName": "SZIOOTH",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest  All Other Lns. & All Lease",
            "LongDescription": "All Other Loans and All LeasesMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)-All Other Loans, Leases and Other Assets.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 582,
            "database": "fdic-sdi-data",
            "VarName": "SZIORES",
            "ShortDescription": "Maximum Amount of Credit Exposure, Retained Interest 1-4 Family",
            "LongDescription": "1-4 Family Residential Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1. In The Form Of:\tRetained Interest-Only Strips (Included In The SecuritiesSchedule And/Or Other Assets)- 1-4 Family Residential Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 173,
            "database": "fdic-sdi-data",
            "VarName": "SZLAUTO",
            "ShortDescription": "Bank Securitization Activities , Principal Balance Auto Loans",
            "LongDescription": "Auto Loans\tBank Securitization Activities\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements -Auto Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 175,
            "database": "fdic-sdi-data",
            "VarName": "SZLNCI",
            "ShortDescription": "Bank Securitization Activities , Principal Balance  C&I Loans",
            "LongDescription": "Commercial & Industrial Loans\tBank Securitization Activities\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements -Commercial AndIndustrial Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 174,
            "database": "fdic-sdi-data",
            "VarName": "SZLNCON",
            "ShortDescription": "Bank Securitization Activities , Principal Balance Other Consumer  Loans",
            "LongDescription": "Other Consumer Loans\tBank Securitization Activities\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements - Other\tConsumer Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 172,
            "database": "fdic-sdi-data",
            "VarName": "SZLNCRCD",
            "ShortDescription": "Bank Securitization Activities, Principal Balance for Credit Cards Rec.",
            "LongDescription": "Credit Cards Receivables\tBank Securitization Activities\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements -Credit Card\tReceivables.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 171,
            "database": "fdic-sdi-data",
            "VarName": "SZLNHEL",
            "ShortDescription": "Bank Securitization Activities, Principal Balance for Home Equity Lines",
            "LongDescription": "Home Equity Lines\tBank Securitization Activities\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements -Home Equity\tLines.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 176,
            "database": "fdic-sdi-data",
            "VarName": "SZLNOTH",
            "ShortDescription": "Bank Securitization Activities , Principal Balance  All Other Lns & Leases",
            "LongDescription": "All Other Loans and All LeasesBank Securitization Activities\t\tOutstanding Principal Balance Of Assets Sold And\tSecuritized With Servicing Retained Or With Recourse Or\tOther Seller-Provided Credit Enhancements -All Other LoansAnd All Leases.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 170,
            "database": "fdic-sdi-data",
            "VarName": "SZLNRES",
            "ShortDescription": "Bank Securitization Activities, Princiapl Balance for 1-4 Family Res.",
            "LongDescription": "1-4 Family Residential Loans\tBank Securitization Activities Outstanding Principal\tBalance Of Assets Sold And Securitized With Servicing\tRetained Or With Recourse Or Other Seller-Provided CreditEnhancements - 1-4 Family Residential Loans.",
            "File": "Bank Assets Sold and Securitized.csv",
            "AON": "numeric"
        },
        {
            "V1": 592,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCAUT",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated Securities Auto Loans",
            "LongDescription": "Auto Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\tAuto Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 594,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCCI",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated Securities C&I",
            "LongDescription": "Commercial & Industrial Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\tCommercial And Industrial Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 593,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCCON",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated  Securities Other Consumer Loans",
            "LongDescription": "Other Consumer Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\tOther Consumer Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 591,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCCRD",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated Securities Credit Cards Rec.",
            "LongDescription": "Credit Cards Receivables\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\tCredit Card Receivables.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 590,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCHEL",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated Securities Home Equity Lines",
            "LongDescription": "Home Equity Lines\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\tHome Equity Lines.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 595,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCOTH",
            "ShortDescription": "Maximum Amount of Credit Exposure, Subordinated Sec.  All Other Lns. & All Lease",
            "LongDescription": "All Other Loans and All LeasesMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of\tSubordinated Securities And Other Residual Interests -\tOther Loans, All Leases and Other Assets.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 589,
            "database": "fdic-sdi-data",
            "VarName": "SZSSCRES",
            "ShortDescription": "Maximum Amount of Credit Exposure,Subordinated Sec. 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential Loans\tMaximum Amount Of Credit Exposure Arising From Recourse\tOr Other Seller-Provided Credit Enhancements Provided ToStructures Reported In RC-S, Item 1 In The Form Of:\tSubordinated Securities And Other Residual Interests -\t1-4 Family Residential Loans.",
            "File": "Maximum Amount of Credit Exposure Retained.csv",
            "AON": "numeric"
        },
        {
            "V1": 1068,
            "database": "fdic-sdi-data",
            "VarName": "SZUCAUTO",
            "ShortDescription": "Reporting Bank's Unused Commitments Auto Loans",
            "LongDescription": "Auto Loans\tReporting Bank's Unused Commitment To Provide Liquidity\tTo Structures Reported In Schedule RC-S, Item 1,\tOutstanding Principal Balance Of Securitized Asset Sales -Auto Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1070,
            "database": "fdic-sdi-data",
            "VarName": "SZUCCI",
            "ShortDescription": "Reporting Bank's Unused Commitments C&I Loans",
            "LongDescription": "Commercial & Industrial Loans\tReporting Bank's Unused Commitment To Provide Liquidity\tTo Structures Reported In Schedule RC-S, Item 1,\tOutstanding Principal Balance Of Securitized Asset Sales -Commercial And Industrial Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1069,
            "database": "fdic-sdi-data",
            "VarName": "SZUCCON",
            "ShortDescription": "Reporting Bank's Unused Commitments Other Consumer Loans",
            "LongDescription": "Other Consumer Loans\tReporting Bank's Unused Commitment To Provide Liquidity\tTo Structures Reported In Schedule RC-S, Item 1,\tOutstanding Principal Balance Of Securitized Asset Sales -Other Consumer Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1067,
            "database": "fdic-sdi-data",
            "VarName": "SZUCCRCD",
            "ShortDescription": "Reporting Bank's Unused Commitments Credit Cards Receivables",
            "LongDescription": "Credit Cards Receivables\tReporting Bank's Unused Commitment To Provide Liquidity\tTo Structures Reported In Schedule RC-S, Item 1,\tOutstanding Principal Balance Of Securitized Asset Sales -Credit Card Receivables.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1066,
            "database": "fdic-sdi-data",
            "VarName": "SZUCHEL",
            "ShortDescription": "Reporting Bank's Unused Commitments Home Equity Lines",
            "LongDescription": "Home Equity Lines\tReporting Bank's Unused Commitment To Provide Liquidity ToStructures Reported In Schedule RC-S, Item 1, OutstandingPrincipal Balance Of Securitized Asset Sales - Home\tEquity Lines.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1071,
            "database": "fdic-sdi-data",
            "VarName": "SZUCOTH",
            "ShortDescription": "Reporting Bank's Unused Commitments All Other Loans and All Leases",
            "LongDescription": "All Other Loans and All Leases\tTo Structures Reported In Schedule RC-S, Item 1,\tOutstanding Principal Balance Of Securitized Asset Sales -All Other Loans, All Leases and Other Assets.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1065,
            "database": "fdic-sdi-data",
            "VarName": "SZUCRES",
            "ShortDescription": "Reporting Bank's Unused Commitments 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential Loans\tReporting Bank's Unused Commitment To Provide Liquidity\tLiquidity To Structures Reported In Schedule RC-S, Item 1,Outstanding Principal Balance Of Securitized Asset Sales -1-4 Family Residential Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1001,
            "database": "fdic-sdi-data",
            "VarName": "TCAMA",
            "ShortDescription": "Corporate trust and agency accounts, managed assets",
            "LongDescription": "The market value of assets held by the institution for all corporate trust and agency accounts held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 707,
            "database": "fdic-sdi-data",
            "VarName": "TCAMANUM",
            "ShortDescription": "Corporate Trust and Agency Accounts",
            "LongDescription": "The number of accounts held by the institution for all corporate trust and agency accounts held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1012,
            "database": "fdic-sdi-data",
            "VarName": "TCANMA",
            "ShortDescription": "Corporate trust and agency accounts, non-managed assets",
            "LongDescription": "The market value of assets held by the institution for all corporate trust and agency accounts held in non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 718,
            "database": "fdic-sdi-data",
            "VarName": "TCANMNUM",
            "ShortDescription": "Corporate Trust and Agency Accounts",
            "LongDescription": "The number of accounts held by the institution for all corporate trust and agency accounts held in non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 297,
            "database": "fdic-sdi-data",
            "VarName": "TCANUM",
            "ShortDescription": "Corporate and Municipal Trusteeships",
            "LongDescription": "The total number of corporate and municipal issues, as well as other debt issues such as unit investment trust for which the institution serves as a trustee. only reported in december.",
            "File": "Corporate Trust and Agency Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 298,
            "database": "fdic-sdi-data",
            "VarName": "TCANUMD",
            "ShortDescription": "Number of corporate trust and agency account issues in default",
            "LongDescription": "Total Number Of Corporate And Municipal Issues, Including Equity Securities Such As Trust Preferred Securities And Other Debt Issues Such As Unit Investment Trusts, For Which The Institution Serves As Trustee And Are In Default. note: 1.) reported as a memoranda item in the december quarter only",
            "File": "Corporate Trust and Agency Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 295,
            "database": "fdic-sdi-data",
            "VarName": "tcapao",
            "ShortDescription": "Principal Amount Outstanding",
            "LongDescription": "The total par value of outstanding debt securities for the issues reported in the number of corporate and municipal trusteeships for which the institution serves as trustee. only reported in december.",
            "File": "Corporate Trust and Agency Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 296,
            "database": "fdic-sdi-data",
            "VarName": "TCAPAOD",
            "ShortDescription": "Amount of corporate trust and agency account issues in default",
            "LongDescription": "Amount of corporate trust and agency account issues in default<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "Corporate Trust and Agency Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 299,
            "database": "fdic-sdi-data",
            "VarName": "TCATNUM",
            "ShortDescription": "Transfer Agent, Registrar, Paying Agent and Other Corporate Agency",
            "LongDescription": "The total number of issues for which the institution acts in a corporate agency capacity. only reported in december.",
            "File": "Corporate Trust and Agency Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 288,
            "database": "fdic-sdi-data",
            "VarName": "TCDEMV",
            "ShortDescription": "Domestic Equality",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - domestic equity. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 280,
            "database": "fdic-sdi-data",
            "VarName": "TCDENUM",
            "ShortDescription": "Domestic Equity",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reported institution ñ domestic equity. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 289,
            "database": "fdic-sdi-data",
            "VarName": "TCIEMV",
            "ShortDescription": "International/Global Equity",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - international/global equity. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 281,
            "database": "fdic-sdi-data",
            "VarName": "TCIENUM",
            "ShortDescription": "International/Global Equity",
            "LongDescription": "International/Global Equity The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - international/global equity. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 292,
            "database": "fdic-sdi-data",
            "VarName": "TCMBMV",
            "ShortDescription": "Municipal Bond",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - municipal bond. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 284,
            "database": "fdic-sdi-data",
            "VarName": "TCMBNUM",
            "ShortDescription": "Municipal Bond",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - municipal bond. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 290,
            "database": "fdic-sdi-data",
            "VarName": "TCSBMV",
            "ShortDescription": "Stock/Bond Blend",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - stock/bond blend. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 282,
            "database": "fdic-sdi-data",
            "VarName": "TCSBNUM",
            "ShortDescription": "Stock/Bond Blend",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - stock/bond blend. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 1016,
            "database": "fdic-sdi-data",
            "VarName": "TCSNMA",
            "ShortDescription": "Custody and safekeeping accounts, non-managed assets",
            "LongDescription": "The market value of personal and institutional custody and safekeeping accounts held by the institution. Safekeeping and custody accounts are a type of agency account in which the reporting institution performs one or more specified agency functions but the institution is not a trustee and also is not responsible for managing the asset selection for account assets note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. all others only report in december.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 722,
            "database": "fdic-sdi-data",
            "VarName": "TCSNMNUM",
            "ShortDescription": "Custody and Safekeeping Accounts",
            "LongDescription": "The number of personal and institutional custody and safekeeping accounts held by the institution. Safekeeping and custody accounts are a type of agency account in which the reporting institution performs one or more specified agency functions but the institution is not a trustee and also is not responsible for managing the the asset selection for account assets. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. all others only report in december.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 294,
            "database": "fdic-sdi-data",
            "VarName": "TCSOMV",
            "ShortDescription": "Specialty/Other",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - specialty/other. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 286,
            "database": "fdic-sdi-data",
            "VarName": "TCSONUM",
            "ShortDescription": "Specialty/Other",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - specialty/other. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 293,
            "database": "fdic-sdi-data",
            "VarName": "TCSTMV",
            "ShortDescription": "Short-term Investments/Money Market",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - short term investments/money market. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 285,
            "database": "fdic-sdi-data",
            "VarName": "TCSTNUM",
            "ShortDescription": "Short-term Investments/Money Market",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - short term investments/money market. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 291,
            "database": "fdic-sdi-data",
            "VarName": "TCTBMV",
            "ShortDescription": "Taxable Bond",
            "LongDescription": "The market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - taxable bond. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 283,
            "database": "fdic-sdi-data",
            "VarName": "TCTBNUM",
            "ShortDescription": "Taxable Bond",
            "LongDescription": "The number of collective investment funds (CIF's) and common trust funds operated by reporting institution - taxable bond. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 287,
            "database": "fdic-sdi-data",
            "VarName": "TCTOTMV",
            "ShortDescription": "Total Market Value of Collective Investment Fund and Common Trust Funds",
            "LongDescription": "The total market value of collective investment funds (CIF's) and common trust funds operated by reporting institution - common trust funds operated by reporting institutions- only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 279,
            "database": "fdic-sdi-data",
            "VarName": "TCTOTNUM",
            "ShortDescription": "Total Number of Collective Investment Funds and Common Trust Funds",
            "LongDescription": "The total number of collective investment funds (CIF's) and common trust funds operated by reporting institution. only reported in december.",
            "File": "Collective Investment & Common Trust Funds.csv",
            "AON": "alpha"
        },
        {
            "V1": 999,
            "database": "fdic-sdi-data",
            "VarName": "TEBMA",
            "ShortDescription": "Employee benefit-defined benefit accounts, managed assets",
            "LongDescription": "The market value of all employee benefit defined benefit accounts in which the institution serves as either trustee or agent and funds are held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 705,
            "database": "fdic-sdi-data",
            "VarName": "TEBMANUM",
            "ShortDescription": "Employee Benefit-defined Benefit Accounts",
            "LongDescription": "The number of employee benefit defined benefit accounts in which the institution serves as either trustee or agent and funds are held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1010,
            "database": "fdic-sdi-data",
            "VarName": "TEBNMA",
            "ShortDescription": "Employee benefit-defined benefit accounts, non-managed Assets",
            "LongDescription": "The market value of all employee benefit defined benefit accounts in which the institution serves as either trustee or agent and funds are held in non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 716,
            "database": "fdic-sdi-data",
            "VarName": "TEBNMNUM",
            "ShortDescription": "Employee Benefit-defined Benefit Accounts",
            "LongDescription": "The number of employee benefit defined benefit accounts in which the institution serves as either trustee or agent and funds are held in non-managed fiduciary accounts note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 998,
            "database": "fdic-sdi-data",
            "VarName": "TECMA",
            "ShortDescription": "Employee benefit-defined contribution accounts, managed assets",
            "LongDescription": "The market value of accounts for all employee benefit defined contribution accounts in which the institution serves as either trustee or agent held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year.li> All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 704,
            "database": "fdic-sdi-data",
            "VarName": "TECMANUM",
            "ShortDescription": "Employee Benefit-defined Contribution Accounts",
            "LongDescription": "The number of account for all employee benefit defined contribution accounts in which the institution serves as either trustee or agent and funds are held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1009,
            "database": "fdic-sdi-data",
            "VarName": "TECNMA",
            "ShortDescription": "Employee benefit-defined contribution accounts, non-managed assets",
            "LongDescription": "The market value of all employee benefit defined contribution accounts in which the institution serves as either trustee or agent and funds are held in non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 715,
            "database": "fdic-sdi-data",
            "VarName": "TECNMNUM",
            "ShortDescription": "Employee Benefit-defined Contribution Accounts",
            "LongDescription": "The number of employee benefit defined contribution accounts in which the institution serves as either trustee or agent and funds are held in non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 32,
            "database": "fdic-sdi-data",
            "VarName": "TECPS",
            "ShortDescription": "Other common & preferred stocks,managed emp benft & retire-related trust accts",
            "LongDescription": "Market Value Of Other Common And Preferred Stocks Held In Employee Benefit And Retirement Related Trust And Agency Accounts. <br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 26,
            "database": "fdic-sdi-data",
            "VarName": "TEEQF",
            "ShortDescription": "Equity mutual funds,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market value of equity mutual funds held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 22,
            "database": "fdic-sdi-data",
            "VarName": "TEI",
            "ShortDescription": "Employee Benefit & Retirement Trust Interest Bearing Deposits",
            "LongDescription": "Market value of interest ñbearing deposits held in employee benefit and retirement trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 20,
            "database": "fdic-sdi-data",
            "VarName": "TEMATOT",
            "ShortDescription": "Managed employee benefit and retirements-related trust and agency acccounts",
            "LongDescription": "Market value of managed employee benefit and retirement related trust and agency accounts.<br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 35,
            "database": "fdic-sdi-data",
            "VarName": "TEMISC",
            "ShortDescription": "Miscellaneous assets,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market Value Of Miscellaneous Assets Held In Employee Benefit And Retirement Related Trust And Agency Accounts. <br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 25,
            "database": "fdic-sdi-data",
            "VarName": "TEMMF",
            "ShortDescription": "Money market mutual Funds,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market value of money market funds held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 21,
            "database": "fdic-sdi-data",
            "VarName": "TENI",
            "ShortDescription": "Managed employee benefit & retirement trust noninterest bearing deposits",
            "LongDescription": "Market value of noninterest-bearing deposits held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 30,
            "database": "fdic-sdi-data",
            "VarName": "TEOTHB",
            "ShortDescription": "Other notes and bonds,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market Value Of other notes And bonds held In employeeBenefit And Retirement-Related Trust And AgencyAccounts<br><br>Note:Reported As A Memoranda Item In The December QuarterOnly",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 27,
            "database": "fdic-sdi-data",
            "VarName": "TEOTHF",
            "ShortDescription": "Other mutual funds,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market value of other mutual funds held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 34,
            "database": "fdic-sdi-data",
            "VarName": "TERE",
            "ShortDescription": "Real Estate,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market Value Of Real Estate Held In Employee Benefit And Retirement Related Trust And Agency Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 33,
            "database": "fdic-sdi-data",
            "VarName": "TEREMTG",
            "ShortDescription": "Real estate mortgages,managed emp benft & retire-related trust accnts",
            "LongDescription": "Market Value Of Real Estate Mortgages Held In Employee Benefits And Retirement Related Trust And Agency Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 24,
            "database": "fdic-sdi-data",
            "VarName": "TESCMUN",
            "ShortDescription": "State, county & municipal obligations,managed emp benft & retire-related",
            "LongDescription": "Market value of state, county and municipal obligations held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 23,
            "database": "fdic-sdi-data",
            "VarName": "TESCUS",
            "ShortDescription": "U.S. treasury and U.S. government agency obligations,managed emp benft&retire",
            "LongDescription": "Market value of U.S. treasury and U.S. government agency obligations held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 29,
            "database": "fdic-sdi-data",
            "VarName": "TESTO",
            "ShortDescription": "Other short-term obligations, emp benft & retire-related trust accnts",
            "LongDescription": "Market value of other short term obligations held in employee benefit and retirement related trust and agency accounts. <br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 431,
            "database": "fdic-sdi-data",
            "VarName": "TETOT",
            "ShortDescription": "YTD fiduciary expense (Dec. only)",
            "LongDescription": "Year-to-date direct and indirect expenses attributable to fiduciary and related services. It includes salaries, wages, bonuses, incentive pay and employee benefits for employees assigned to reportable activities. It also includes expenses related to premises, furniture, etc... note: 1) Filed in december only by institutions with more than $100 million in fiduciary assets. 2) Prior to March 2009, this information is considered confidential at the institution level by the ffiec.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 28,
            "database": "fdic-sdi-data",
            "VarName": "TETRF",
            "ShortDescription": "Common trust funds & collective investment funds,managd emp benft & retiremnt",
            "LongDescription": "Market value of common trust funds and collective investment funds held in employee benefit and retirement related trust and agency accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 31,
            "database": "fdic-sdi-data",
            "VarName": "TEUF",
            "ShortDescription": "Investments in unregistered funds & private equity investmnts,emp benft & retire",
            "LongDescription": "Market Value Of Investments In Unregistered Funds And Private Equity Investments Held In Employee Benefit And Retirement Related Trust And Agency Accounts. <br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 1003,
            "database": "fdic-sdi-data",
            "VarName": "TFEMA",
            "ShortDescription": "Foundation and endowment trust and agency accounts, managed assets",
            "LongDescription": "Market Value Of All Institutional Foundations AndEndowments For Which The Institution Serves As EitherTrustee Or Agent That Are Held In Managed Asset Accounts <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 709,
            "database": "fdic-sdi-data",
            "VarName": "TFEMANUM",
            "ShortDescription": "# of foundation and endowment trust and agency accounts, managed assets",
            "LongDescription": "Number Of All Institutional Foundations And EndowmentsFor Which The Institution Serves As Either Trustee Or Agent That Are Held In Managed Asset Accounts. <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The Prior Calendar Year. (2) All Other December Only (IBA'S)",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1014,
            "database": "fdic-sdi-data",
            "VarName": "TFENMA",
            "ShortDescription": "Foundation and endowment trust and agency accounts, non-managed assets",
            "LongDescription": "Market Value Of All Institutional Foundations AndEndowments For Which The Institution Serves As EitherTrustee Or Agent That Are Held In Non-Managed AssetAccounts.<br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 720,
            "database": "fdic-sdi-data",
            "VarName": "TFENMNUM",
            "ShortDescription": "Number (#) individual retirement, health savings, and other similar accounts",
            "LongDescription": "Number Of All Institutional Foundations And EndowmentsFor Which The Institution Serves As Either Trustee Or AgentThat Are Held In Non-Managed Asset Accounts  <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 425,
            "database": "fdic-sdi-data",
            "VarName": "TICA",
            "ShortDescription": "YTD Gross Income corporate trust and agency",
            "LongDescription": "Year-to-date gross income generated from corporate trust and agency relationships note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 429,
            "database": "fdic-sdi-data",
            "VarName": "TICS",
            "ShortDescription": "YTD Gross income custody and safekeeping agency accounts",
            "LongDescription": "Year-to-date gross income not generated from custody and safekeeping agency accounts. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 423,
            "database": "fdic-sdi-data",
            "VarName": "TIEB",
            "ShortDescription": "YTD Gross Income employee benefit defined benefit",
            "LongDescription": "Year-to-date gross income generated from defined benefit employee benefit trust and agency accounts note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 422,
            "database": "fdic-sdi-data",
            "VarName": "TIEC",
            "ShortDescription": "YTD Gross Income employee benefit defined contribution",
            "LongDescription": "Year-to-date gross income generated from defined contribution employee benefit trust and agency accounts. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 427,
            "database": "fdic-sdi-data",
            "VarName": "TIFE",
            "ShortDescription": "Foundation and endowment and agency accounts income",
            "LongDescription": "Year to Date Gross Income Generated From Foundation And EndowmentTrust And Agency Accounts <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The Prior Calendar Year2) Institutions With Total Fiduciary Assets Greater Than $100 Million But Less Than Or Equal To $250 Million (Prior December) That Do Not Meet The 10% Test Report In December Only.3) All Others Do Not Report4) Prior To 2009, This Information Is Considered Confidential At The Institution Level By The FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 426,
            "database": "fdic-sdi-data",
            "VarName": "TIMA",
            "ShortDescription": "Investment management and investment advisory agency accounts income",
            "LongDescription": "Year to Date Gross Income Generated From Investment ManagementAnd Investment Advisory Agency Accounts <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The Prior Calendar Year2) Institutions With Total Fiduciary Assets Greater Than $100 Million But Less Than Or Equal To $250 Million (Prior December) That Do Not Meet The 10% Test Report In December Only.3) All Others Do Not Report4) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1002,
            "database": "fdic-sdi-data",
            "VarName": "TIMMA",
            "ShortDescription": "Investment management  and investment advisory agency accounts, managed assets",
            "LongDescription": "The market value of all individual and institutional investment management agency accounts administered within the fiduciary area of the institution, held in managed asset accounts note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 389,
            "database": "fdic-sdi-data",
            "VarName": "TIMMAGL",
            "ShortDescription": "Gross losses for investment management and investment  managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts - Investment Management AndInvestment Advisory Agency Accounts <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 708,
            "database": "fdic-sdi-data",
            "VarName": "TIMMANUM",
            "ShortDescription": "Number of managed investment management  and investment advisory agency accounts",
            "LongDescription": "The number of all individual and institutional investment management agency accounts administered within the fiduciary area of the institution, held in managed asset accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1013,
            "database": "fdic-sdi-data",
            "VarName": "TIMNMA",
            "ShortDescription": "Investment management and advisory agency accounts, non-managed assets",
            "LongDescription": "Market Value Of All Individual And Institutional Investment Management And Investment Advisory Agency Accounts Administered Within The Fiduciary Area Of The Institution, Held In Non-Managed Asset Accounts.<br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The Prior Calendar Year.(2) All Other December Only (IBA'S)",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 394,
            "database": "fdic-sdi-data",
            "VarName": "TIMNMGL",
            "ShortDescription": "Investmnt managmnt & investmnt advisory agency accts-gross losses nonmanaged a",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other Losses Arising From Errors, Misfeasance, Or Malfeasance On Non-Managed Accounts - Investment Management And Investment Advisory Agency Accounts reported in december only by institutions with greater than $100 million in total fiduciary assets or institutions with gross fiduciary and related services income greater than 10% of revenue NOTE: 1) Reported As A Memoranda Item in December 2) Prior To 2009, This Information Is Considered Confidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 719,
            "database": "fdic-sdi-data",
            "VarName": "TIMNMNUM",
            "ShortDescription": "# of investment management and advisory agency accounts, non-managed assets",
            "LongDescription": "Number Of All Individual And Institutional InvestmentManagement And Investment Advisory Agency AccountsAdministered Within The Fiduciary Area Of The Institution,Held In Non-Managed Asset Accounts <br><br>Note: 1) Reported Quarterly By Institutions With TotalFiduciary Assets Greater Than $250 Million (PriorDecember) Or With Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue (Net InterestIncome Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 399,
            "database": "fdic-sdi-data",
            "VarName": "TIMREC",
            "ShortDescription": "Investment management and investment advisory agency accounts  recoveries",
            "LongDescription": "Recoveries From Gross Settlements, Surcharges And OtherLosses Arising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts And/Or Non-Managed Accounts -Investment Management And Investment Advisory AgencyAccounts <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 433,
            "database": "fdic-sdi-data",
            "VarName": "TINTRA",
            "ShortDescription": "YTD fiduciary intracompany income (Dec. only)",
            "LongDescription": "Year-to-date intracompany income credits for fiduciary and related services. note: 1) filed in december only by institutions with more than $100 million in fiduciary assets. 2) Prior to March 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 428,
            "database": "fdic-sdi-data",
            "VarName": "TIOF",
            "ShortDescription": "YTD Gross income other trust and agency accounts",
            "LongDescription": "Year-to-date gross income generated from other trust and agency accounts. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "alpha"
        },
        {
            "V1": 424,
            "database": "fdic-sdi-data",
            "VarName": "TIOR",
            "ShortDescription": "YTD Gross Income from  other retirement accounts",
            "LongDescription": "Year-to-date gross income generated from other retirement accounts. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 421,
            "database": "fdic-sdi-data",
            "VarName": "TIP",
            "ShortDescription": "YTD Gross Income from Personal trust and agency accounts",
            "LongDescription": "Year-to-date gross income generated from personal trust and agency accounts, includes all income from testamentary trust, revocable and irrevocable living trust, other personal trust and non-managed personal agency accounts. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the ffiec.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 430,
            "database": "fdic-sdi-data",
            "VarName": "TIR",
            "ShortDescription": "YTD Gross income other trust accounts",
            "LongDescription": "Year-to-date gross income not reported in other trust accounts, includes income received from investment advisory activities when assets are not held by the institution. note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the ffiec.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 435,
            "database": "fdic-sdi-data",
            "VarName": "TITOTF",
            "ShortDescription": "YTD foreign offices total gross fiduciary income",
            "LongDescription": "YTD total gross fiduciary and related services income from foreign offices note: 1) not reported on a quarterly basis. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1005,
            "database": "fdic-sdi-data",
            "VarName": "TMAF",
            "ShortDescription": "Fiduciary accounts held in foreign offices, managed assets",
            "LongDescription": "The market value of fiduciary accounts held in foreign offices - managed assets. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 711,
            "database": "fdic-sdi-data",
            "VarName": "TMAFNUM",
            "ShortDescription": "Fiduciary Accounts Held in Foreign Offices",
            "LongDescription": "The number of fiduciary accounts held in foreign offices - managed assets note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1007,
            "database": "fdic-sdi-data",
            "VarName": "TMASMF",
            "ShortDescription": "Investments of managed fiduciary accts in advised or sponsored mutual funds",
            "LongDescription": "Managed Assets Held In Fiduciary Accounts: Market Value Of Managed Fiduciary Accounts In Advised Or Sponsored Mutual Funds <br><br>Note:1.) Reported As A Memoranda Item In The December QuarterOnly",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "alpha"
        },
        {
            "V1": 713,
            "database": "fdic-sdi-data",
            "VarName": "TMASMFN",
            "ShortDescription": "# of investments of managed fiduciary accts in advised or sponsored mutual funds",
            "LongDescription": "Managed Assets Held In Fiduciary Accounts:Number Of Managed Fiduciary Accounts In Advised OrSponsored Mutual Funds <br><br>Note: Reported As A Memoranda Item In The December QuarterOnly",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 434,
            "database": "fdic-sdi-data",
            "VarName": "TNI",
            "ShortDescription": "YTD net fiduciary income (Dec. only)",
            "LongDescription": "Year-to-date net fiduciary and related services income note: 1) filed in december only by institutions with more than $100 million in fiduciary assets. 2) Prior to March 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 432,
            "database": "fdic-sdi-data",
            "VarName": "TNL",
            "ShortDescription": "YTD fiduciary net loss (Dec. only)",
            "LongDescription": "Year-to-date net losses resulting from fiduciary and related services. Net losses are gross losses less recoveries. note: 1) filed in december only by institutions with more than $100 million in fiduciary assets. 2) prior to march 2009, this information is considered confidential at the institution level by the FFIEC.",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 1017,
            "database": "fdic-sdi-data",
            "VarName": "TNMAF",
            "ShortDescription": "Fiduciary accounts held in foreign offices, non-managed Assets",
            "LongDescription": "The market value of fiduciary accounts held in foreign offices - non-managed assets. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 723,
            "database": "fdic-sdi-data",
            "VarName": "TNMNUMF",
            "ShortDescription": "Fiduciary Accounts Held in Foreign Offices",
            "LongDescription": "The number of fiduciary accounts held in foreign offices - non-managed assets. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 48,
            "database": "fdic-sdi-data",
            "VarName": "TOCPS",
            "ShortDescription": "Other common and preferred stocks, all other managed accounts",
            "LongDescription": "Market Value Of Other Common And Preferred Stocks Held In All Other Fiduciary Accounts.  <br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 42,
            "database": "fdic-sdi-data",
            "VarName": "TOEQF",
            "ShortDescription": "Equity mutual funds, all other managed accounts",
            "LongDescription": "Market Of Equity Mutual Funds Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 1004,
            "database": "fdic-sdi-data",
            "VarName": "TOFMA",
            "ShortDescription": "Other fiduciary accounts, managed assets",
            "LongDescription": "The market value of all other trust and agencies not reported in FFIEC Call Report Schedule RC-T line 4 through line 7 and held in managed asset accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 390,
            "database": "fdic-sdi-data",
            "VarName": "TOFMAGL",
            "ShortDescription": "Gross losses for other fiduciary accounts and related managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts - Other Fiduciary Accounts and Related Managed Accounts  <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 710,
            "database": "fdic-sdi-data",
            "VarName": "TOFMANUM",
            "ShortDescription": "Other Fiduciary Accounts",
            "LongDescription": "The number of all other trust and agencies not reported in FFIEC Call Report Schedule RC-T line 4 through line 7 and held in managed asset accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1015,
            "database": "fdic-sdi-data",
            "VarName": "TOFNMA",
            "ShortDescription": "Other fiduciary accounts, non-managed assets",
            "LongDescription": "The market value of all other trust and agencies not reported in FFIEC Call Report Schedule RC-T line 4 through line 7 and held in non-managed asset accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 395,
            "database": "fdic-sdi-data",
            "VarName": "TOFNMAGL",
            "ShortDescription": "Other fiduciary accounts and related services-gross losses nonmanaged asts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Non-Managed Accounts - Other Fiduciary Accounts AndRelated Services <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 721,
            "database": "fdic-sdi-data",
            "VarName": "TOFNMNUM",
            "ShortDescription": "Other Fiduciary Accounts",
            "LongDescription": "The number of all other trust and agencies not reported in schedule FFIEC Call Report Schedule RC-T line 4 through line 7 and held in non-managed asset accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 400,
            "database": "fdic-sdi-data",
            "VarName": "TOFREC",
            "ShortDescription": "Other fiduciary accounts and related services-recoveries",
            "LongDescription": "Recoveries From Gross Settlements, Surcharges And OtherLosses Arising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts And/Or Non-Managed Accounts -Other Fiduciary Accounts And Related Services <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item 2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 38,
            "database": "fdic-sdi-data",
            "VarName": "TOI",
            "ShortDescription": "Interest-bearing deposits, all other managed accounts",
            "LongDescription": "Market Value Of Interest Bearing Deposit Savings And Time Deposits Including NOW Accounts, MMDA Accounts, Bank Investment Contracts That Are Insured By The FDIC, CDs, And Interest Bearing Deposits Of Both Principal And Income Cash.<br><br>Note:  Reported As A Memoranda Item December Only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 36,
            "database": "fdic-sdi-data",
            "VarName": "TOMATOT",
            "ShortDescription": "Total all other managed assets:",
            "LongDescription": "Market Value Of Managed Assets Held In Corporate Trust And Agency Accounts, Foundation And Endowment Trust And Agency Accounts And All Other Fiduciary Accounts. note: reported as a memoranda item december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 51,
            "database": "fdic-sdi-data",
            "VarName": "TOMISC",
            "ShortDescription": "Miscellaneous assets, all other managed accounts",
            "LongDescription": "Miscellaneous assets held in all other fiduciary accounts.<br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 41,
            "database": "fdic-sdi-data",
            "VarName": "TOMMF",
            "ShortDescription": "Money market mutual funds, all other managed accounts",
            "LongDescription": "Market Value Of Money Market Mutual Funds Held In All Other Fiduciary Accounts.  <br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 37,
            "database": "fdic-sdi-data",
            "VarName": "TONI",
            "ShortDescription": "Noninterest-bearing Deposits, all other managed accounts",
            "LongDescription": "Noninterest Bearing Accounts:  Market Value Of Noninterest Bearing Deposits Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 46,
            "database": "fdic-sdi-data",
            "VarName": "TOOTHB",
            "ShortDescription": "Other notes and bonds, all other managed accounts",
            "LongDescription": "Market Value Of Other Notes And Bonds Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 43,
            "database": "fdic-sdi-data",
            "VarName": "TOOTHF",
            "ShortDescription": "Other mutual funds, all other managed accounts",
            "LongDescription": "Other Mutual Funds:  Market Value Of Other Mutual Funds Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 50,
            "database": "fdic-sdi-data",
            "VarName": "TORE",
            "ShortDescription": "Real estate, all other managed accounts",
            "LongDescription": "Market value of real estate held in all other fiduciary accounts.  <br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 49,
            "database": "fdic-sdi-data",
            "VarName": "TOREMTG",
            "ShortDescription": "Real Estate Mortgages, all other managed accounts",
            "LongDescription": "Market value of real estate mortgages held in all other fiduciary accounts.  <br><br>Note:  Reported as a memoranda item December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 1000,
            "database": "fdic-sdi-data",
            "VarName": "TORMA",
            "ShortDescription": "Other employee benefit and retirement-related accounts, managed assets",
            "LongDescription": "The market value for all other retirement related fiduciary accounts in which the institution serves as either trustee or agent and funds are held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 706,
            "database": "fdic-sdi-data",
            "VarName": "TORMANUM",
            "ShortDescription": "Number of other employee benefit and retirement-related accounts",
            "LongDescription": "The number of all other retirement related fiduciary accounts in which the institution serves as either trustee or agent and funds are held in managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1011,
            "database": "fdic-sdi-data",
            "VarName": "TORNMA",
            "ShortDescription": "Other retirement accounts, non-managed assets",
            "LongDescription": "The market value for all other retirement related fiduciary accounts in which the institution serves as either trustee or agent and funds are held in non-managed fiduciary accounts note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 717,
            "database": "fdic-sdi-data",
            "VarName": "TORNMNUM",
            "ShortDescription": "Number non-managed  other employee benefit and retirement-related accounts",
            "LongDescription": "The number of all other retirement related fiduciary accounts in which the institution serves as either trustee or agent and funds are held in non managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 40,
            "database": "fdic-sdi-data",
            "VarName": "TOSCMUN",
            "ShortDescription": "State, county and municipal obligations, all other managed accounts",
            "LongDescription": "Market Value Of All Short And Long-Term Obligations Of State And Local Governments, And Political Subdivisions Of The United States, Obligations Of U.S. Territories And Insular Possessions And Their Political Subdivisions And All Federal Income Tax-Exempt Obligations Of Authorities Such As Local Housing And Industrial Development Authorities That Derive Their Tax-Exempt Status From Relationships With State Or Local Governments. Tax-Exempt Money Market Mutual Funds Should Be Reported With Money Market Mutual Funds Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 39,
            "database": "fdic-sdi-data",
            "VarName": "TOSCUS",
            "ShortDescription": "U.S. treasury & U.S. government agency obligations, all other managed accounts",
            "LongDescription": "Market Value Of All Securities Of And/Or Loans To The U.S. Government And U.S. Government Corporations And Agencies To Include Certificates Or Other Obligations,  That Represent Pass-Through Participations In Pools Of Real Estate Loans When The Participation Instruments Are Issued By FHA-Approved Mortgagees And Guaranteed By The Government National Mortgage Association,  Guaranteed By A U.S. Government Agency Or Corporation, Collateralized Mortgage Obligations (CMOS), Real Estate Mortgage Investment Conduits (REMICS) Issued By The Federal National Mortgage Association (FNMA) ('Fannie Mae') And The Federal Home Loan Mortgage Corporation (FHLMC) ('Freddie Mac') Held In All Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 45,
            "database": "fdic-sdi-data",
            "VarName": "TOSTO",
            "ShortDescription": "Other short-term obligations, all other managed accounts",
            "LongDescription": "Short Term Obligations:  Market Value Of Other Short Term Obligations Held In All Other Fiduciary Accounts. <br><br>Note:  Reported As A Memoranda Item December Only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 44,
            "database": "fdic-sdi-data",
            "VarName": "TOTRF",
            "ShortDescription": "Common trust funds and collective investment funds, all other managed account",
            "LongDescription": "Market Value Of Common Trust Funds And Collective Investment Funds Held In All Other Fiduciary Accounts.  <br><br>Note:  Reported As A Memoranda Item December Only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 47,
            "database": "fdic-sdi-data",
            "VarName": "TOUF",
            "ShortDescription": "Investmnts in unregistered funds&private equity investmnts, all other managed",
            "LongDescription": "Unregistered Funds:  Market Value Of Investments In Unregistered Funds And Private Equity Investments Held In Other Fiduciary Accounts.<br><br>Note:  Reported As A Memoranda Item December Only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 16,
            "database": "fdic-sdi-data",
            "VarName": "TPICPS",
            "ShortDescription": "Other common and preferred stocks, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of other common and preferred stocks, managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 10,
            "database": "fdic-sdi-data",
            "VarName": "TPIEQF",
            "ShortDescription": "Equity mutual funds, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of equity mutual funds, managed personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 6,
            "database": "fdic-sdi-data",
            "VarName": "TPII",
            "ShortDescription": "Interest-bearing deposits managed personal trust and agency accounts and investm",
            "LongDescription": "Market Value of personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 4,
            "database": "fdic-sdi-data",
            "VarName": "TPIMATOT",
            "ShortDescription": "Total managed assets held in fiduciary accounts",
            "LongDescription": "Market Value of total managed assets held in fiduciary accountspersonal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 19,
            "database": "fdic-sdi-data",
            "VarName": "TPIMISC",
            "ShortDescription": "Miscellaneous assets, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of miscellaneous assets, managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 9,
            "database": "fdic-sdi-data",
            "VarName": "TPIMMF",
            "ShortDescription": "Money market mutual funds, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of money market mutual funds - managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 5,
            "database": "fdic-sdi-data",
            "VarName": "TPINI",
            "ShortDescription": "Managed personal trust&agency accnts & investmnt managemnt agency accounts",
            "LongDescription": "Market value of total managed assets held in personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 14,
            "database": "fdic-sdi-data",
            "VarName": "TPIOTHB",
            "ShortDescription": "Other Notes and Bonds, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of other Notes and Bonds, managed personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 11,
            "database": "fdic-sdi-data",
            "VarName": "TPIOTHF",
            "ShortDescription": "Other mutual funds, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of other mutual funds, managed personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 18,
            "database": "fdic-sdi-data",
            "VarName": "TPIRE",
            "ShortDescription": "Real Estate, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of real Estate, managed personal personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 17,
            "database": "fdic-sdi-data",
            "VarName": "TPIREMTG",
            "ShortDescription": "Real Estate Mortgages, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of real Estate Mortgages, managed personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 8,
            "database": "fdic-sdi-data",
            "VarName": "TPISCMUN",
            "ShortDescription": "State, county and municipal obligations, managed personal trust&agency accts,",
            "LongDescription": "State, county and municipal obligations, managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 7,
            "database": "fdic-sdi-data",
            "VarName": "TPISCUS",
            "ShortDescription": "US Treasury & US government agency obligations, managed personal trust&agency",
            "LongDescription": "Market value of US Treasury & US government agency obligations in personal trust and agency accounts and investment management agency accounts in total managed assets held in fiduciary accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 13,
            "database": "fdic-sdi-data",
            "VarName": "TPISTO",
            "ShortDescription": "Other Short-term obligations, managed personal trust&agency accts, etc..",
            "LongDescription": "Market value of other Short-term obligations, managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 12,
            "database": "fdic-sdi-data",
            "VarName": "TPITRF",
            "ShortDescription": "Common trust funds and collective investment funds, managed personal trust&ag",
            "LongDescription": "Market value of common trust funds and collective investment funds, managed personal trust and agency accounts and investment management agency accounts<br><br>Note:  Reported as a memoranda item in December only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 15,
            "database": "fdic-sdi-data",
            "VarName": "TPIUF",
            "ShortDescription": "Investmnts in unregistered funds&private equity investmnts,managd personal trust",
            "LongDescription": "Market value of investments in unregistered funds & private equity investments, managed personal trust and agency accounts and investment management agency accounts note: reported as a memoranda item in december only.",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv",
            "AON": "alpha"
        },
        {
            "V1": 997,
            "database": "fdic-sdi-data",
            "VarName": "TPMA",
            "ShortDescription": "Personal trust and agency accounts, managed assets",
            "LongDescription": "The market value of personal trust and agency accounts held in managed fiduciary accounts. Includes testamentary trusts, revocable and irrevocable living trusts, other personal trusts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 387,
            "database": "fdic-sdi-data",
            "VarName": "TPMAGL",
            "ShortDescription": "Fiduciary settlements, surcharges, and other losses, managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts - Personal Trust And Agency Accounts  <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note:1) Reported As A Memoranda Item in December only2) Prior to 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 703,
            "database": "fdic-sdi-data",
            "VarName": "TPMANUM",
            "ShortDescription": "Personal Trust and Agency Accounts",
            "LongDescription": "The total number of managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1008,
            "database": "fdic-sdi-data",
            "VarName": "TPNMA",
            "ShortDescription": "Personal trust and agency accounts, non-managed assets",
            "LongDescription": "The market value of personal trust and agency accounts held in non-managed fiduciary accounts. Includes testamentary trusts, revocable and irrevocable living trusts, other personal trusts and non-managed personal agency accounts held. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior december) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 392,
            "database": "fdic-sdi-data",
            "VarName": "TPNMGL",
            "ShortDescription": "Fiduciary settlements, surcharges, and other losses",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other Losses Arising From Errors, Misfeasance, Or Malfeasance On Non-Managed Accounts - Fiduciary settlements, surcharges, and other losses reported in december only by institutions with greater than $100 million in total fiduciary assets or institutions with gross fiduciary and related services income greater than 10% Of Revenue Note: 1) Reported As A Memoranda Item 2) Prior To 2009, This Information Is Considered Confidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 714,
            "database": "fdic-sdi-data",
            "VarName": "TPNMNUM",
            "ShortDescription": "Personal Trust and Agency Accounts",
            "LongDescription": "The total number of non-managed fiduciary accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 397,
            "database": "fdic-sdi-data",
            "VarName": "TPTREC",
            "ShortDescription": "Fiduciary settlements, surcharges, and other - recoveries",
            "LongDescription": "Recoveries From Gross Settlements, Surcharges And OtherLosses Arising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts And/Or Non-Managed Accounts - Fiduciary Settlements, Surcharges, and Other <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 3,
            "database": "fdic-sdi-data",
            "VarName": "tract",
            "ShortDescription": "Fiduciary or related activity",
            "LongDescription": "Beyond having trust powers granted and exercised, institutions with fiduciary assets accounts, income, or other reportable fiduciary related service. note:;domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 420,
            "database": "fdic-sdi-data",
            "VarName": "TRACT",
            "ShortDescription": "Fiduciary or related activity",
            "LongDescription": "Beyond having trust powers granted and exercised, institutions with fiduciary assets accounts, income, or other reportable fiduciary related service. note:;domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 125,
            "database": "fdic-sdi-data",
            "VarName": "trade",
            "ShortDescription": "Trading account assets",
            "LongDescription": "Securities and other assets acquired with the intent to resell in order to profit from short-term price movements. Effective January 1, 1994, this item includes revaluation gains.  This item is included in securities for TFR Reporters.",
            "File": "Assets and Liabilities.csv; Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 137,
            "database": "fdic-sdi-data",
            "VarName": "tradel",
            "ShortDescription": "Trading liabilities",
            "LongDescription": "Starting in 1994, includes liability for short positions and revaluation losses on interest rate, foreign exchange rate, and other commodity and equity contracts.   This item is not available for TFR Reporters.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 2,
            "database": "fdic-sdi-data",
            "VarName": "trexer",
            "ShortDescription": "Fiduciary power exercised",
            "LongDescription": "Institution or trust company subsidiary of the institution exercises fiduciary powers granted by a state or national regulatory authority to administer accounts in a fiduciary capacity. Fiduciary capacity generally means: trustee, executor, administrator, registrar of stocks and bonds, transfer agent, guardian, assignee, receiver, custodian under a uniform gifts to minors act, investment advisor, any capacity in which the institution possesses investment discretion on behalf of another, or any similar capacity. Note:;Domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 419,
            "database": "fdic-sdi-data",
            "VarName": "TREXER",
            "ShortDescription": "Fiduciary power exercised",
            "LongDescription": "Institution or trust company subsidiary of the institution exercises fiduciary powers granted by a state or national regulatory authority to administer accounts in a fiduciary capacity. Fiduciary capacity generally means: trustee, executor, administrator, registrar of stocks and bonds, transfer agent, guardian, assignee, receiver, custodian under a uniform gifts to minors act, investment advisor, any capacity in which the institution possesses investment discretion on behalf of another, or any similar capacity. Note:;Domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 953,
            "database": "fdic-sdi-data",
            "VarName": "trfor",
            "ShortDescription": "Trading account assets",
            "LongDescription": "Securities and other assets held in foreign offices that are acquired with the intent to resell in order to profit from short-term price movements. Effective January 1, 1994, this item includes revaluation gains.",
            "File": "Total Assets and Liabilities in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 1006,
            "database": "fdic-sdi-data",
            "VarName": "TRHMA",
            "ShortDescription": "Individual retirement,health savings and similar accounts, managed assets",
            "LongDescription": "Market Value Of Individual Retirement Accounts, HealthSavings Accounts And Other Similar Accounts That AreHeld In Managed Asset Accounts (Included In Schedule RC-TItems 5.C And 11) <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 712,
            "database": "fdic-sdi-data",
            "VarName": "TRHMANUM",
            "ShortDescription": "# of Individual retirement, health savings, and similar accounts,managed assets",
            "LongDescription": "Number Of Individual Retirement Accounts, Health SavingsAccounts And Other Similar Accounts That Are Held InManaged Asset Accounts (Included In Schedule RC-T Items5.C And 11) <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The Prior Calendar Year.(2) All Other December Only (IBA'S)",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1018,
            "database": "fdic-sdi-data",
            "VarName": "TRHNMA",
            "ShortDescription": "Individual retirement,health savings and similar accounts, non-managed",
            "LongDescription": "Market Value Of Individual Retirement Accounts, HealthSavings Accounts And Other Similar Accounts That AreHeld In Non-Managed Asset Accounts (Included In Schedule RCItems 5.C And 11) <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 724,
            "database": "fdic-sdi-data",
            "VarName": "TRHNMNUM",
            "ShortDescription": "# of Individual retirement,health savings and similar accounts, non-managed asts",
            "LongDescription": "Number Of Individual Retirement Accounts, Health SavingsAccounts And Other Similar Accounts That Are Held In Non-Managed Asset Accounts (Included In Schedule RC-T Items5.C And 11) <br><br>Note: 1) Reported Quarterly By Institutions With Total Fiduciary Assets Greater Than $250 Million (Prior December) Or With Fiduciary And Related Services Income Greater Than 10% Of Revenue (Net Interest Income Plus Noninterest Income) For The PriorCalendar Year.(2) All Other December Only (IBA'S)",
            "File": "Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 894,
            "database": "fdic-sdi-data",
            "VarName": "trlreval",
            "ShortDescription": "Revaluation losses on off-balance sheet contracts",
            "LongDescription": "Trading liabilities revaluation losses on interest rate, foreign exchange rate, and other commodity and equity contracts.  This item is only available for banks with $1 billion or more in total assets or banks with $2 billion or more in notional amount of interest rate, foreign exchange rate, and other commodity and equity contracts.   This item is not available for TFR Reporters.",
            "File": "Securities.csv",
            "AON": "numeric"
        },
        {
            "V1": 983,
            "database": "fdic-sdi-data",
            "VarName": "trn",
            "ShortDescription": "Transaction accounts",
            "LongDescription": "The sum of the following accounts held in domestic offices: demand deposits, NOW accounts, Automated Transfer Service (ATS) accounts and telephone or preauthorized transfer accounts. prior to 2004, this item is not available for tfr reporters.",
            "File": "Small Business Loans.csv; Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1055,
            "database": "fdic-sdi-data",
            "VarName": "trncbo",
            "ShortDescription": "Commercial banks and other depository institutions in the U.S.",
            "LongDescription": "Transaction accounts of commercial banks and other depository institutions in the U.S.    This item is not available for TFR Reporters.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1057,
            "database": "fdic-sdi-data",
            "VarName": "trnfc",
            "ShortDescription": "Banks in foreign countries",
            "LongDescription": "Total transaction accounts of banks in foreign countries held in domestic offices.  This item is not reported by institutions with less than $100 million in total assets.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1056,
            "database": "fdic-sdi-data",
            "VarName": "trnfcfg",
            "ShortDescription": "Foreign deposits",
            "LongDescription": "Total transaction accounts of banks in foreign countries, foreign government and official institutions (includes foreign central banks) held in domestic offices.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1058,
            "database": "fdic-sdi-data",
            "VarName": "trnfg",
            "ShortDescription": "Foreign governments and official institutions",
            "LongDescription": "Total transaction accounts of foreign governments and official institutions (includes foreign central banks) held in domestic offices. This item is not reported by institutions with less than $100 million in total assets.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1052,
            "database": "fdic-sdi-data",
            "VarName": "trnipcoc",
            "ShortDescription": "Individuals, partnerships and corporations",
            "LongDescription": "Transaction deposits of individuals, partnerships and corporations including certified and official checks held in domestic offices.    This item is not available for TFR Reporters.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1054,
            "database": "fdic-sdi-data",
            "VarName": "trnmuni",
            "ShortDescription": "States and political subdivisions in U.S.",
            "LongDescription": "Total transaction accounts of states, counties, municipalities, and local housing authorities (or political subdivisions) held in domestic offices.  Included are deposits of funds advanced to states and political subdivisions by the U.S. government and corporations, and deposits of withheld income taxes of states and political subdivisions.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 350,
            "database": "fdic-sdi-data",
            "VarName": "TRNNIA",
            "ShortDescription": "Amount of noninterest-bearing transaction deposit accounts over $250,000",
            "LongDescription": "The amount of noninterest-bearing transaction deposit accounts (according to section 343 of the Dodd-Frank act)  of more than $250,000 held in domestic offices and in insured branches in US territories & possessions at the end of the reporting period. This item is available December 2010 through December 2013.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 351,
            "database": "fdic-sdi-data",
            "VarName": "TRNNIN",
            "ShortDescription": "Number of noninterest-bearing transaction deposit accounts over $250,000",
            "LongDescription": "The number of noninterest-bearing transaction accounts (according to section 343 of the Dodd-Frank act) of more than $250,000 held in domestic offices and in insured branches in US territories & possessions at the end of the reporting period. This item is available as of December 2010 through December 2013.",
            "File": "Deposits Based on the $250,000 Reporting Threshold.csv",
            "AON": "alpha"
        },
        {
            "V1": 1053,
            "database": "fdic-sdi-data",
            "VarName": "trnusgov",
            "ShortDescription": "U.S. government",
            "LongDescription": "Total transaction accounts of federal public funds made by or for the account of the U.S. government which are held in domestic offices.",
            "File": "Transaction Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 1,
            "database": "fdic-sdi-data",
            "VarName": "trpower",
            "ShortDescription": "Fiduciary powers granted",
            "LongDescription": "Institution has been granted trust powers by a state or national regulatory authority to administer accounts in a fiduciary capacity. Fiduciary capacity generally means: trustee, executor, administrator, registrar of stocks and bonds, transfer agent, guardian, assignee, receiver, custodian under a uniform gifts to minors act, investment advisor, any capacity in which the institution possesses investment discretion on behalf of another, or any similar capacity. Note:;Domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; ;All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "----Total Managed Assets held in Fiduciary Accounts.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 418,
            "database": "fdic-sdi-data",
            "VarName": "TRPOWER",
            "ShortDescription": "Fiduciary powers granted",
            "LongDescription": "Institution has been granted trust powers by a state or national regulatory authority to administer accounts in a fiduciary capacity. Fiduciary capacity generally means: trustee, executor, administrator, registrar of stocks and bonds, transfer agent, guardian, assignee, receiver, custodian under a uniform gifts to minors act, investment advisor, any capacity in which the institution possesses investment discretion on behalf of another, or any similar capacity. Note:;Domestic offices of foreign banks (a.k.a. IBAís -- as defined by the International Banking Act) report annually, as of December.; ;All institutions that have any fiduciary or related assets file this information annually each December. However, Quarterly data is ONLY available for institutions that have total fiduciary assets greater than $250 million AND gross fiduciary and related service income greater than 10% of the revenue from the preceding calendar year.;",
            "File": "Gross Fiduciary and Related Services Income.csv",
            "AON": "numeric"
        },
        {
            "V1": 388,
            "database": "fdic-sdi-data",
            "VarName": "TRTMAGL",
            "ShortDescription": "Employee benefit and retirement-related gross losses for managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts - Employee Benefit And RetirementRelated Trust And Agency Accounts  <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 393,
            "database": "fdic-sdi-data",
            "VarName": "TRTNMGL",
            "ShortDescription": "Employee benefit and retirement-related trust and agency accounts, non-managed",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other Losses Arising From Errors, Misfeasance, Or Malfeasance On Non-Managed Accounts - Employee Benefit And Retirement Related Trust And Agency Accounts reported in december only by institutions with greater than $100 million in total fiduciary assets or institutions with gross fiduciary and related services income greater than 10% of revenue Note: 1) Reported As A Memoranda Item in December 2) Prior To 2009, This Information Is Considered Confidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 398,
            "database": "fdic-sdi-data",
            "VarName": "TRTREC",
            "ShortDescription": "Employee benefit and retirement-related trust and agency accounts-recoveries",
            "LongDescription": "Recoveries From Gross Settlements, Surcharges And OtherLosses Arising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts And/Or Non-Managed Accounts -Employee Benefit And Retirement Related Trust AndAgency Accounts <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <BR><BR>NOTE: 1) Reported As A Memoranda Item2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 324,
            "database": "fdic-sdi-data",
            "VarName": "trust",
            "ShortDescription": "Trust Powers",
            "LongDescription": "A flag used to indicate an institution's Trust Powers Granted status. 0 = No Trust Power Granted 1 = Trust Power Granted Where Trust Power has been granted specific codes are: 00 - Trust powers not know 10 - Full trust powers granted 11 - Full trust powers granted, exercised 12 - Full trust powers granted, not exercised 20 - Limited trust powers granted 21 - Limited trust powers granted, exercised 22 - Limited trust powers granted, not exercised 30 - Trust powers not granted 31 - Trust powers not granted, but exercised",
            "File": "Demographic Information.csv",
            "AON": "numeric"
        },
        {
            "V1": 988,
            "database": "fdic-sdi-data",
            "VarName": "ts",
            "ShortDescription": "Total time and savings deposits",
            "LongDescription": "Total transaction and nontransaction time and savings deposit accounts held in domestic offices.  This item is not available for TFR reporters with assets less than $300 million and risk-based capital ratios in excess of 12 percent.",
            "File": "Total Deposits.csv",
            "AON": "numeric"
        },
        {
            "V1": 383,
            "database": "fdic-sdi-data",
            "VarName": "TTMA",
            "ShortDescription": "Managed Assets ($)",
            "LongDescription": "Total managed assets reported quarterly by institutions with total fiduciary assets greater than $250 million (prior December) or with fiduciary and related services income greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year.",
            "File": "Derivatives.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 380,
            "database": "fdic-sdi-data",
            "VarName": "TTNANUM",
            "ShortDescription": "Number of Managed Accounts",
            "LongDescription": "The total number of managed accounts. note: reported quarterly by institutions with total fiduciary assets of greater than $250 million (prior December) or with fiduciary and related services income of greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year. All others only report in December.",
            "File": "Derivatives.csv; Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 384,
            "database": "fdic-sdi-data",
            "VarName": "TTNMA",
            "ShortDescription": "Non-managed Assets ($)",
            "LongDescription": "Total non-managed reported quarterly by institutions with total fiduciary assets greater than $250 million (prior December) or with fiduciary and related services income greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year.",
            "File": "Derivatives.csv; Total Fiduciary and Related Assets.csv",
            "AON": "numeric"
        },
        {
            "V1": 381,
            "database": "fdic-sdi-data",
            "VarName": "TTNMNUM",
            "ShortDescription": "Number of Non-Managed Accounts",
            "LongDescription": "The total number of non-managed accounts reported quarterly by institutions with total fiduciary assets greater than $250 million (prior December) or with fiduciary and related services income greater than 10% of revenue (net interest income plus noninterest income) for the prior calendar year.",
            "File": "Derivatives.csv; Number of Fiduciary and Related Asset Accounts.csv",
            "AON": "numeric"
        },
        {
            "V1": 386,
            "database": "fdic-sdi-data",
            "VarName": "TTOTMAGL",
            "ShortDescription": "Gross losses for managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts - Total Fiduciary Settlements,Surcharges, And Other Losses <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December only.2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 391,
            "database": "fdic-sdi-data",
            "VarName": "TTOTNMGL",
            "ShortDescription": "Gross losses for non-managed accounts",
            "LongDescription": "Aggregate Gross Settlements, Surcharges And Other LossesArising From Errors, Misfeasance, Or MalfeasanceOn Non-Managed Accounts - Total <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item in December2) Prior To 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 396,
            "database": "fdic-sdi-data",
            "VarName": "TTOTREC",
            "ShortDescription": "Recoveries fiduciary and related services income",
            "LongDescription": "Recoveries From Gross Settlements, Surcharges And OtherLosses Arising From Errors, Misfeasance, Or MalfeasanceOn Managed Accounts And/Or Non-Managed Accounts -Total <br><br>Reported In December Only By Institutions With GreaterThan $100 Million In Total Fiduciary Assets OrInstitutions With Gross Fiduciary And Related ServicesIncome Greater Than 10% Of Revenue <br><br>Note: 1) Reported As A Memoranda Item2) Prior To March 2009, This Information Is ConsideredConfidential At The Institution Level By The FFIEC.",
            "File": "Fiduciary settlements, surcharges, and other losses.csv",
            "AON": "numeric"
        },
        {
            "V1": 168,
            "database": "fdic-sdi-data",
            "VarName": "uc",
            "ShortDescription": "Total unused commitments",
            "LongDescription": "The unused portions of commitments to make or purchase extensions of credit in the form of loans or participations in loans, lease financing receivables, or similar transactions for which a fee has been paid or are otherwise legally bound.",
            "File": "Assets and Liabilities.csv; Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1037,
            "database": "fdic-sdi-data",
            "VarName": "uccomre",
            "ShortDescription": "Commercial real estate, construction & land development",
            "LongDescription": "Unused portions of commitments to extend credit for commercial real estate, construction, and land development activities (includes commitments secured and unsecured by real estate).",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1038,
            "database": "fdic-sdi-data",
            "VarName": "uccomres",
            "ShortDescription": "Commitments secured by real estate",
            "LongDescription": "Unused portions of commitments to extend credit to finance commercial and multifamily residential properties and land development.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1039,
            "database": "fdic-sdi-data",
            "VarName": "uccomreu",
            "ShortDescription": "Commitments not secured by real estate",
            "LongDescription": "Unused portions of commitments to extend credit to finance commercial and residential real estate activities reported as 'commercial and industrial loans' or 'other loans'.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1036,
            "database": "fdic-sdi-data",
            "VarName": "uccrcd",
            "ShortDescription": "Credit card lines",
            "LongDescription": "Unused portions of commitments to extend credit both to individuals for household, family, and other personal expenditures and to commercial or industrial enterprises through credit cards.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 165,
            "database": "fdic-sdi-data",
            "VarName": "ucln",
            "ShortDescription": "Unused loan commitments",
            "LongDescription": "Includes unused credit card lines and home equity lines, commitments to make loans for commercial real estate construction and land development, and commitments to originate or purchase loans.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 1035,
            "database": "fdic-sdi-data",
            "VarName": "ucloc",
            "ShortDescription": "Loan commitments-revolving, open-end lines secured by 1-4's",
            "LongDescription": "Unused commitments for revolving, open-end lines secured by 1-4 family residential properties.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1041,
            "database": "fdic-sdi-data",
            "VarName": "ucother",
            "ShortDescription": "Other unused commitments",
            "LongDescription": "Unused portion of commitments for purposes other than revolving, open-end lines secured by 1-4 family residential property, credit card lines, commercial real estate, construction and land development, and securities underwriting.  This includes commitments to extend credit through overdraft facilities or commercial lines of credit and retail check, credit, and related plans.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1042,
            "database": "fdic-sdi-data",
            "VarName": "ucover1",
            "ShortDescription": "Commitments with an original maturity exceeding 1 yr",
            "LongDescription": "All unused commitments that obligate the bank to extend credit in the form of loans or participations in loans, lease financing receivables or similar transactions and have an original maturity date exceeding one year.  This item reflects only the unused portion (gross amount) of commitments that a fee has been paid or otherwise legally binding.  Banks having assets less than $100 million do not report this item.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1040,
            "database": "fdic-sdi-data",
            "VarName": "ucsc",
            "ShortDescription": "Securities underwriting",
            "LongDescription": "The unsold portions of the reporting bank's takedown in securities underwriting transactions.  This includes revolving underwriting facilities (RUF), note issuance facilities (NIF) and other similar arrangements.",
            "File": "Total Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1075,
            "database": "fdic-sdi-data",
            "VarName": "UCSZAUTO",
            "ShortDescription": "Reporting Bank's Unused Commitments, Liquidity Auto Loans",
            "LongDescription": "Auto LoansReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On Auto Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1077,
            "database": "fdic-sdi-data",
            "VarName": "UCSZCI",
            "ShortDescription": "Reporting Bank's Unused Commitments, Liquidity C&I Loans",
            "LongDescription": "Commercial & Industrial LoansReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On Commercial And Industrial Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1076,
            "database": "fdic-sdi-data",
            "VarName": "UCSZCON",
            "ShortDescription": "Reporting Bank's Unused Commitments, Liquidity Other Consumer Loans",
            "LongDescription": "Other Consumer LoansReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On OtherConsumer Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1074,
            "database": "fdic-sdi-data",
            "VarName": "UCSZCRCD",
            "ShortDescription": "Reporting Bank's Unused Commitments, Liquidity Credit Cards Receivables",
            "LongDescription": "Credit Cards ReceivablesReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On Credit Card Receivables.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1073,
            "database": "fdic-sdi-data",
            "VarName": "UCSZHEL",
            "ShortDescription": "Reporting Bank's Unused Commitments Home Equity Lines",
            "LongDescription": "Home Equity LinesReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On Home Equity Lines.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1078,
            "database": "fdic-sdi-data",
            "VarName": "UCSZOTH",
            "ShortDescription": "Reporting Bank's Unused Commitments, Liquidity All Other Lns. & All Ls.",
            "LongDescription": "All Other Loans and All LeasesReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On All Other Loans, Other Assets and Leases.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 1072,
            "database": "fdic-sdi-data",
            "VarName": "UCSZRES",
            "ShortDescription": "Reporting Bank's Unused Commitments 1-4 Family Residential Loans",
            "LongDescription": "1-4 Family Residential LoansReporting Bank's Unused Commitments To Provide LiquidityTo Other Institutions Securitization Structures On 1-4 Family Residential Loans.",
            "File": "Unused Commitments.csv",
            "AON": "numeric"
        },
        {
            "V1": 939,
            "database": "fdic-sdi-data",
            "VarName": "unincfor",
            "ShortDescription": "Unearned income",
            "LongDescription": "Unearned income on loans held in foreign offices.",
            "File": "Securities.csv; Total Loans and Leases in Foreign Offices.csv",
            "AON": "numeric"
        },
        {
            "V1": 161,
            "database": "fdic-sdi-data",
            "VarName": "voliab",
            "ShortDescription": "Volatile liabilities",
            "LongDescription": "Volatile liabilities on a consolidated basisincludes:<br>(1) Federal funds purchased and securities soldunder agreements to repurchase,<br>(2) Demand notes issued to the US Treasury andother borrowed money (beginning March 1997includes mortgage indebtedness and obligationsunder capitalized leases),<br>(3) Time deposits over $250,000 held in domesticoffices (prior to march 2010, includes time depositsof $100,000 or more in domestic offices)<br>(4) Foreign office deposits <br>(5) Trading liabilities less trading liabilitiesrevaluation losses on interest rate, foreign exchangerate, and other commodity and equity contracts.<br><br> Note:The volatile liabilities definition was changed in March 2011 to incorporate the change in time deposits to include deposits over $250,000 as of the March 2010 reporting period.  Prior to the March 2010 reporting period, this item included deposits of $100,000 or more.",
            "File": "Assets and Liabilities.csv",
            "AON": "numeric"
        },
        {
            "V1": 334,
            "database": "fdic-sdi-data",
            "VarName": "webaddr",
            "ShortDescription": "Primary Internet Web Address:",
            "LongDescription": "The primary internet web address is the public internet site obtained from the most recent FFIEC Call Report (CALL) for commercial banks or from the supplemental information for Thrift Financial Reporters (TFR). the primary internet web address is included only for those institutions reporting an address on the most recent ffiec call report or thrift financial report. this information resides in the most recent demographic information file. For some institutions users will find that for the item Primary Internet Web Address: the caption will read 'Web site not available'. Possible reasons that a Web site may not be available are: The institution failed to file on the most recent call report or TFR. The institution filed a primary Internet Web address on its most recent FFIEC Call Report;however, the address filed by the institution was not in accordance with the instructions provided by the FFIEC on how to file a primary Internet Web address or FDIC attempts to validate and access the site were unsuccessful. Users may also experience instances where the URL provided for primary Internet Web address in ID returns an error stating that the site is not found. Possible reasons for such occurrences are: The institutionís reported primary Web address was valid as of the date that the demographic information was updated in ID, but is no longer valid. The institutionís reported Internet Web address is valid, but the institutionís Web site was inoperable at the time that the user attempted to access it due to technical problems being experienced by the institutionís Web site, the institutionís web provider, the userís Web provider, or other issues not related to the validity of the Web address. Users are advised to contact the institution on any questions regarding the services provided by the institution. For questions involving the reporting of primary Internet Web address by those institutions that file a FFIEC Call report, users are advised to contact supervision@fdic.gov. For questions involving the primary Internet Web address of institutions that file a Thrift Financial Report, users are advised to call the contacts listed at http://files.ots.treas.gov/84234.pdf Disclaimer: The Primary Internet Web Addresses listed have been reported to the FDIC by each institution. The hyperlinks to institution Internet sites are provided solely as a convenience to users of the FDIC Internet site. The FDIC has made a limited effort to determine that these links function properly. However, linked sites are not under the control of FDIC, and FDIC is not responsible for the contents of any linked site, or any link contained in a linked site. Even if you access an institutionís site by means of the link provided by FDIC, you are responsible for confirming the identity and authenticity of any institution you visit and transact business with online. The inclusion of a link does not imply or constitute an endorsement by FDIC of the institution, its ownership or management, the products or services it offers, or any advertisers or sponsors appearing on the institutionís web site.",
            "File": "Demographic Information.csv",
            "AON": "alpha"
        }
    ];
    for (var i = 0; i <= glossaryItems.length; i++) {
        if (glossaryItems[i] && glossaryItems[i].VarName.toUpperCase() === varname.toUpperCase()) {
            return glossaryItems[i];
        }
    }
}
localEmitter.on('ready-to-run-putItem', function (itemsparam) {
    //console.log(itemsparam);
    dynamodb.putItem(itemsparam, function (err, data) {
        if (err) {
            arrErrors.push({ err: err, itemsparam: itemsparam });
            console.log('err', err, itemsparam);
        }
        else {
            console.log('ready-to-run-putItem data', data);
            localEmitter.emit('ready-to-get-next-from-array');
        }
    });
});
localEmitter.on('ready-to-get-next-from-array', function () {
    var itemsCount = arrPutItemsParams.length;
    if (itemsCount > 0) {
        var nextItems = arrPutItemsParams.pop();
        console.log('in ready-to-get-next-from-array', nextItems);
        localEmitter.emit('ready-to-run-putItem', nextItems);
    }
});
var x = {
    TableName: 'FDIC-2013-09-30-NUM',
    Item: {
        varname: { S: 'offfor' },
        ddval: { N: '0' },
        cert: { N: '18402' }
    }
};
//console.log(x)
//dynamodb.putItem(x, function (err, data) {
//    console.log(err);
//    console.log(data);
//})
load('All_Reports_20130930_Total Debt Securities.csv');
//# sourceMappingURL=table-loader.js.map