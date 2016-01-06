var QDate = (function () {
    function QDate(year, quarter) {
        this.details = [];
        this._isValid = true;
        //validate inputs
        var regexYear = /^[0-9]{4}$/;
        if (!regexYear.test(year.toString())) {
            this.details.push('year must be a 4-digit number');
            this._isValid = false;
        }
        var regexQuarter = /^[1-4]$/;
        if (!regexQuarter.test(quarter.toString())) {
            this.details.push('quarter must be between 1 and 4 (inclusive)');
            this._isValid = false;
        }
        this._year = year;
        this._quarter = quarter;
    }
    Object.defineProperty(QDate.prototype, "string", {
        get: function () {
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
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(QDate.prototype, "isValid", {
        get: function () {
            return this._isValid;
        },
        enumerable: true,
        configurable: true
    });
    QDate.prototype.getNext = function () {
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
    };
    return QDate;
})();
exports.QDate = QDate;
//# sourceMappingURL=QDate.js.map