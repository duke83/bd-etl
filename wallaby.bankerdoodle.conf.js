module.exports = function () {
    return {
        files: [
            '!Library/**/*.spec.ts',
            '!Library/**/*.spec.js',
            'Library/**/*.ts',
            'Library/**/*.js'
        ],

        tests: [
            'Library/**/*.spec.ts',
            'Library/**/*.spec.js'
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