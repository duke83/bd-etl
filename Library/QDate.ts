export class QDate {

    private _year:number;
    private _quarter:number
    private _isValid:boolean;
    public details:Array<string> = [];

    get string():string {
        //if(this.isValid)
        var rtrnQtr:string
        switch (this._quarter) {
            case 1:
            {
                rtrnQtr = '0331'
                break;
            }
            case 2:
            {
                rtrnQtr = '0630'
                break;
            }
            case 3:
            {
                rtrnQtr = '0930'
                break;
            }
            case 4:
            {
                rtrnQtr = '1231'
                break;
            }
        }

        return this._year.toString() + rtrnQtr
    }

    public get isValid():boolean {
        return this._isValid;

    }

    public  getNext():QDate {
        var newQuarter:number;
        var newYear:number;
        if (this._quarter == 4) {
            newQuarter = 1;
            newYear = this._year + 1
        }
        else {
            newQuarter = this._quarter + 1;
            newYear = this._year
        }
        return new QDate(newYear, newQuarter)
    }

    constructor(year:number, quarter:number) {
        this._isValid=true;
        //validate inputs
        const regexYear = /^[0-9]{4}$/;
        if (!regexYear.test(year.toString())) {
            this.details.push('year must be a 4-digit number')
            this._isValid = false;
        }

        const regexQuarter = /^[1-4]$/
        if (!regexQuarter.test(quarter.toString())) {
            this.details.push('quarter must be between 1 and 4 (inclusive)')
            this._isValid = false;
        }

        this._year = year;
        this._quarter = quarter;
    }
}