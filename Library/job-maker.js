var QDateModule = require('./QDate');
var JobMaker = (function () {
    function JobMaker() {
    }
    JobMaker.prototype.make = function () {
        var qd = new QDateModule.QDate(2012, 1);
        console.log(qd);
        console.log('moo');
    };
    return JobMaker;
})();
exports.JobMaker = JobMaker;
// THIS IS THE CLIENT PORTION
// INSTANTIATE A NEW JobMaker OBJECT
var maker = new JobMaker();
// INVOKE THE make() METHOD
maker.make();
console.log(QDateModule);
//# sourceMappingURL=job-maker.js.map