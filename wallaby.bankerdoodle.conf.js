module.exports = function () {
    return {
        files: [
            '!BankerDoodleETL/**/*.spec.ts',
            '!BankerDoodleETL/**/*.spec.js',
            'fdic-etl/**/*.ts',
            'fdic-etl/**/*.js'
        ],

        tests: [
            'BankerDoodleETL/**/*.spec.ts',
            'BankerDoodleETL/**/*.spec.js'
        ],
        env: {
            type: 'node'
        },

        testFramework:'jasmine',

        workers: {
            recycle: true
        }
    };
};