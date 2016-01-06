module.exports = function (wallaby) {
    return {
        files: [
            {"pattern":"lib/angular/angular.js","instrument":false},
            'js/*.js',
            "!src/**/*.spec.js"
        ],

        tests: [
            'js/**/*.spec.js'
        ]

        // for node.js tests you need to set env property as well
        // http://wallabyjs.com/docs/integration/node.html
    };
};