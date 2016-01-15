/// <reference path="../typings/node.d.ts" />

var async = require('async');

var files = [
    {filename: 'All_Reports_20141231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20131231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20121231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20111231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20101231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20091231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20081231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20071231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20061231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20051231_Net+Loans+and+Leases.csv', recordCount: 40},
    {filename: 'All_Reports_20041231_Net+Loans+and+Leases.csv', recordCount: 40}
];



function processFilesWhile() {
    var x = 10
    while (x > 0) {
        myLongfunction(files[x], function (data) {
            x--
        })
    }
}
var x = 10
function processFilesWhilst(){
    async.whilst(
        //test
        function(){return x > 0},
        //run this every time test is true
        function(cb)//cb(error)
        {
            x--
            myLongfunction(files[x],function(cb1){
                if(cb1){
                   console.log('myLongfunction returns',cb1)
                    cb(null,'xx')
                }
                else{
                    console.log('muLongfunction no joy', cb1)
                    cb("got an error")
                }

            })
        },
        //run this when test fails and/or repeated execution stops
        function(err, n){
            console.log('err', err);
            console.log('n',n)
        }
    )
}

function myLongfunction(filename, cb) {
    setTimeout(function () {
        console.log(filename)
        cb(true)
    }, 1000)
}


//processFiles()
//processFilesWhile()
processFilesWhilst()