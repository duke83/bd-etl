import * as QDateModule from './QDate'

export  class JobMaker {
    constructor(){}

    make(){
var qd = new QDateModule.QDate(2012,1);
        console.log(qd)
        console.log( 'moo');
    }
}




// THIS IS THE CLIENT PORTION
// INSTANTIATE A NEW JobMaker OBJECT
var maker = new JobMaker()

// INVOKE THE make() METHOD
maker.make()
console.log(QDateModule)