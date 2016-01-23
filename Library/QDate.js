'use strict';
class QDate {
    constructor(year, quarter) {
        this._validationMessages = [];
        this._year = year;
        this._quarter = quarter;
        this._isValid = true;
        //validate inputs
        const regexYear = /^[0-9]{4}$/;
        if (!regexYear.test(year.toString())) {
            this._validationMessages.push('year must be a 4-digit number');
            this._isValid = false;
        }
        const regexQuarter = /^[1-4]$/;
        if (!regexQuarter.test(quarter.toString())) {
            this._validationMessages.push('quarter must be between 1 and 4 (inclusive)');
            this._isValid = false;
        }
    }
    get string() {
        //if(this.isValid)
        var rtrnQtr;
        switch (this._quarter) {
            case 1:
                {
                    rtrnQtr = '0331';
                    break;
                }
            case 2:
                {
                    rtrnQtr = '0630';
                    break;
                }
            case 3:
                {
                    rtrnQtr = '0930';
                    break;
                }
            case 4:
                {
                    rtrnQtr = '1231';
                    break;
                }
        }
        return this._year.toString() + rtrnQtr;
    }
    get tablename_alpha() {
        return 'FDIC-' + this._year + '-' + this.getMonthAndDayFromQuarter() + '-ALPHA';
    }
    get tablename_numeric() {
        return 'FDIC-' + this._year + '-' + this.getMonthAndDayFromQuarter() + '-NUM';
    }
    getMonthAndDayFromQuarter() {
        if (this._quarter == 1)
            return "03-31";
        if (this._quarter == 2)
            return "06-30";
        if (this._quarter == 3)
            return "09-30";
        if (this._quarter == 4)
            return "12-31";
    }
    get isValid() {
        return this._isValid;
    }
    static getQDateFromFileName(filename) {
        //filename should be something like:
        //All_Reports_20131231_Net+Loans+and+Leases.csv
        var year = parseInt(filename.substring(12, 16));
        var qrtr = QDate.getQuarterFromDateString(filename.substring(16, 20));
        return new QDate(year, qrtr);
    }
    //There will only ever by a single first quarter date for this dataset
    //It happens to be 19921231
    static getFirstQuarterQdate() {
        return new QDate(1992, 4);
    }
    static getQuarterFromDateString(datestring) {
        //datstring should be something like '1231'
        switch (datestring) {
            case '0331':
                return 1;
            case '0630':
                return 2;
            case '0930':
                return 3;
            case '1231':
                return 4;
        }
        return null;
    }
    getNext() {
        var newQuarter;
        var newYear;
        if (this._quarter == 4) {
            newQuarter = 1;
            newYear = this._year + 1;
        }
        else {
            newQuarter = this._quarter + 1;
            newYear = this._year;
        }
        return new QDate(newYear, newQuarter);
    }
}
exports.QDate = QDate;
//var qd = QDate.getFirstQuarterQdate();
//
//while(qd.string<'20151231'){
//    console.log(qd)
//    qd = qd.getNext()
//}
//console.log(QDate.getFirstQuarterQdate().getNext()) 
//# sourceMappingURL=QDate.js.map