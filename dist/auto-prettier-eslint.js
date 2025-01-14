"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.activate = activate;
exports.serialize = serialize;
exports.run = run;
exports.getCurrentFilePath = getCurrentFilePath;
exports.getPathToESLint = getPathToESLint;
exports.getPathToPrettier = getPathToPrettier;
exports.getValidFilePaths = getValidFilePaths;
exports.execPrettier = execPrettier;
exports.execEslint = execEslint;
exports.cliExec = cliExec;
exports.provideLinter = provideLinter;
const child_process_1 = require("child_process");
const config_js_1 = __importDefault(require("./config.js"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const atom_linter_1 = require("atom-linter");
const eslint_1 = __importDefault(require("eslint"));
const cliEngine = new eslint_1.default.ESLint({});
function bytes2String(bytes) {
    let result = "";
    for (let i = 0; i < bytes.length; i++) {
        result += String.fromCharCode(bytes[i]);
    }
    return result;
}
exports.config = config_js_1.default;
let next_ready = false;
let editor = null;
let start_time = Date.now();
function parseErrorsAsync() {
    const results = [];
    let parsing = current_errors;
    const messages = [];
    let file_path = "";
    parsing = parsing.substring(0, parsing.lastIndexOf(" problem") + 1);
    let qtty = parseInt(parsing.substring(parsing.lastIndexOf("\n"), parsing.length - 1));
    let aqtty = parsing.substring(parsing.lastIndexOf("\n"), parsing.length - 1);
    while (parsing.length > 0 && qtty > 0) {
        --qtty;
        const fileAndWhere = parsing.substring(0, parsing.indexOf(" "));
        parsing = parsing.substring(parsing.indexOf(" "));
        const message = parsing.substring(0, parsing.indexOf("\n"));
        parsing = parsing.substring(parsing.indexOf("\n") + 1);
        const [fp, line, column, _] = fileAndWhere.split(":");
        file_path = fp;
        messages.push({
            message: message,
            line: Number(line) - 1,
            column: Number(column) - 1,
            ruleId: null,
        });
    }
    results.push({
        filePath: file_path,
        messages: messages,
        errorCount: messages.length,
        fatalErrorCount: 0,
        warningCount: 0,
        fixableErrorCount: 0,
        fixableWarningCount: 0,
    });
    return fromLintToLinter(results);
}
function fromLintToLinter(results) {
    const promises = [];
    for (let i = 0; i < results.length; ++i) {
        for (let j = 0; j < results[i].messages.length; ++j) {
            promises.push({
                severity: "error",
                excerpt: results[i].messages[j].message,
                location: {
                    file: results[i].filePath,
                    position: (0, atom_linter_1.generateRange)(editor, results[i].messages[j].line, results[i].messages[j].column),
                },
            });
        }
    }
    return Promise.resolve(promises);
}
function waitToReady() {
    return new Promise((resolve, reject) => {
        const id = setInterval(() => {
            if (next_ready || Date.now() > start_time + 30000) {
                clearInterval(id);
                resolve(parseErrorsAsync());
            }
        });
    });
}
let current_errors = "";
let current_results = null;
const current_config = exports.config;
let running = false;
let child = null;
function logNotification(text, tittle = "-- DEBUG --") {
    const args = { dismissable: tittle === "-- DEBUG --", detail: text };
    atom.notifications.addInfo(tittle, args);
}
function activate() {
    atom.commands.add("atom-workspace", {
        "auto-eslint-prettier:run": () => {
            run();
        },
    });
    atom.workspace.observeTextEditors((editor) => {
        editor.onDidSave(() => {
            atom.notifications.clear();
            const files = getValidFilePaths(current_config.prettierFileType.get(), getCurrentFilePath());
            if (files.length === 0)
                return;
            if (running && child) {
                child.kill();
                running = false;
            }
            if (!running) {
                if (current_config.notifications.get()) {
                    logNotification("", "Running auto-eslint-prettier");
                }
                running = true;
                run();
            }
        });
    });
}
function serialize() { }
function run() {
    execPrettier(getCurrentFilePath());
}
function getCurrentWorkingDir(filepath) {
    let cwd;
    atom.project.getDirectories().forEach(function (dir) {
        const dirpath = dir.getPath();
        const relpath = path_1.default.relative(dirpath, filepath);
        const dirIsParent = !/^\.\.\//.test(relpath);
        if (dirIsParent) {
            cwd = dirpath;
        }
    });
    cwd = cwd || process.cwd();
    return cwd;
}
function getCurrentFilePath() {
    return atom.workspace.getActivePaneItem().getPath();
}
function getPathToESLint(cwd) {
    if (current_config.eslintPath.get()) {
        return current_config.eslintPath.get();
    }
    if (fs_1.default.existsSync(`${cwd}/node_modules/.bin/eslint`)) {
        return "./node_modules/.bin/eslint";
    }
    return "eslint";
}
function getPathToPrettier(cwd) {
    if (current_config.prettierPath.get()) {
        return current_config.prettierPath.get();
    }
    if (fs_1.default.existsSync(`${cwd}/node_modules/.bin/prettier`)) {
        return "./node_modules/.bin/prettier";
    }
    return "prettier";
}
function getValidFilePaths(fileType, filepath) {
    const files = [];
    const paths = filepath instanceof Array ? filepath.slice() : [filepath];
    const rex = new RegExp("\\.(" + fileType.replace(/\s*,\s*/g, "|") + ")$");
    for (let i = 0; i < paths.length; ++i) {
        if (rex.test(paths[i])) {
            files.push(paths[i]);
        }
    }
    return files;
}
function execPrettier(filepath) {
    const args = getValidFilePaths(current_config.prettierFileType.get(), filepath);
    if (args.length === 0) {
        running = false;
        return;
    }
    args.unshift("-w");
    args.unshift("--cache");
    const cwd = getCurrentWorkingDir(filepath);
    const runner = getPathToPrettier(cwd);
    cliExec(cwd, runner, args, () => {
        execEslint(filepath);
    });
}
function execEslint(filepath) {
    const args = getValidFilePaths(current_config.eslintFileType.get(), filepath);
    if (args.length === 0) {
        running = false;
        return;
    }
    args.unshift("--fix");
    args.unshift("--cache");
    args.unshift("--no-ignore");
    args.unshift("--format=unix");
    const cwd = getCurrentWorkingDir(filepath);
    const runner = getPathToESLint(cwd);
    cliExec(cwd, runner, args, () => { });
}
function cliExec(cwd, runner, arg, callback) {
    if (runner.includes("eslint")) {
    }
    child = (0, child_process_1.execFile)(runner, arg, { cwd, shell: false }, (error, stdout, stderr) => {
        const out = stdout;
        const err = stderr;
        const args = { detail: err ? err + "\n" + out : out, dismissable: false };
        const notif = error ? current_config.zerror.get() : current_config.ysuccess.get();
        if (current_config.notifications.get()) {
            logNotification("", runner + " compleated");
        }
        if (runner.includes("eslint")) {
            current_errors = out;
            if (current_results != null) {
                current_results.then(parseErrorsAsync);
            }
            next_ready = true;
        }
        running = false;
        child = null;
        callback();
        if (notif.type === "none") {
            return;
        }
        else if (notif.type === "dismissable" && err.length + out.length > 0) {
            args.dismissable = true;
        }
        if (error) {
            atom.notifications.addError(runner + " failed", args);
        }
        else {
            atom.notifications.addSuccess(runner + " successful", args);
        }
    });
}
function provideLinter() {
    return {
        name: "Eslint",
        grammarScopes: ["source.ts"],
        scope: "file",
        lintsOnChange: false,
        lint: (current_editor) => {
            editor = current_editor;
            next_ready = false;
            start_time = Date.now();
            current_results = waitToReady();
            return current_results;
        },
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1wcmV0dGllci1lc2xpbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9saWIvYXV0by1wcmV0dGllci1lc2xpbnQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUEsWUFBWSxDQUFDOzs7Ozs7QUFxR2IsNEJBeUJDO0FBRUQsOEJBQThCO0FBRTlCLGtCQUVDO0FBZ0JELGdEQUdDO0FBRUQsMENBUUM7QUFFRCw4Q0FRQztBQUVELDhDQVVDO0FBRUQsb0NBYUM7QUFFRCxnQ0FjQztBQUVELDBCQTJDQztBQUVELHNDQWNDO0FBalJELGlEQUF5QztBQUN6Qyw0REFBaUM7QUFDakMsZ0RBQXdCO0FBQ3hCLDRDQUFvQjtBQUNwQiw2Q0FBNEM7QUFFNUMsb0RBQTRCO0FBRTVCLE1BQU0sU0FBUyxHQUFrQixJQUFJLGdCQUFNLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXZELFNBQVMsWUFBWSxDQUFDLEtBQUs7SUFDekIsSUFBSSxNQUFNLEdBQUcsRUFBRSxDQUFDO0lBQ2hCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFLENBQUM7UUFDdEMsTUFBTSxJQUFJLE1BQU0sQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFDMUMsQ0FBQztJQUNELE9BQU8sTUFBTSxDQUFDO0FBQ2hCLENBQUM7QUFFWSxRQUFBLE1BQU0sR0FBRyxtQkFBTSxDQUFDO0FBQzdCLElBQUksVUFBVSxHQUFHLEtBQUssQ0FBQztBQUN2QixJQUFJLE1BQU0sR0FBRyxJQUFJLENBQUM7QUFDbEIsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO0FBRTVCLFNBQVMsZ0JBQWdCO0lBQ3ZCLE1BQU0sT0FBTyxHQUFHLEVBQUUsQ0FBQztJQUNuQixJQUFJLE9BQU8sR0FBRyxjQUFjLENBQUM7SUFDN0IsTUFBTSxR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QUFDLElBQUksS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUMxQixPQUFPO1FBQ1QsQ0FBQzthQUFNLElBQUksS0FBSyxDQUFDLElBQUksS0FBSyxhQUFhLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDO1lBQ3ZFLElBQUksQ0FBQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1FBQzFCLENBQUM7UUFDRCxJQUFJLEtBQUssRUFBRSxDQUFDO1lBQ1YsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsTUFBTSxHQUFHLFNBQVMsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUN4RCxDQUFDO2FBQU0sQ0FBQztZQUNOLElBQUksQ0FBQyxhQUFhLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxhQUFhLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFDOUQsQ0FBQztJQUNILENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztBQUVELFNBQWdCLGFBQWE7SUFDM0IsT0FBTztRQUNMLElBQUksRUFBRSxRQUFRO1FBQ2QsYUFBYSxFQUFFLENBQUMsV0FBVyxDQUFDO1FBQzVCLEtBQUssRUFBRSxNQUFNO1FBQ2IsYUFBYSxFQUFFLEtBQUs7UUFDcEIsSUFBSSxFQUFFLENBQUMsY0FBYyxFQUFrQixFQUFFO1lBQ3ZDLE1BQU0sR0FBRyxjQUFjLENBQUM7WUFDeEIsVUFBVSxHQUFHLEtBQUssQ0FBQztZQUNuQixVQUFVLEdBQUcsSUFBSSxDQUFDLEdBQUcsRUFBRSxDQUFDO1lBQ3hCLGVBQWUsR0FBRyxXQUFXLEVBQUUsQ0FBQztZQUNoQyxPQUFPLGVBQWUsQ0FBQztRQUN6QixDQUFDO0tBQ0YsQ0FBQztBQUNKLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJcInVzZSBzdHJpY3RcIjtcblxuaW1wb3J0IHsgZXhlY0ZpbGUgfSBmcm9tIFwiY2hpbGRfcHJvY2Vzc1wiO1xuaW1wb3J0IENvbmZpZyBmcm9tIFwiLi9jb25maWcuanNcIjtcbmltcG9ydCBwYXRoIGZyb20gXCJwYXRoXCI7XG5pbXBvcnQgZnMgZnJvbSBcImZzXCI7XG5pbXBvcnQgeyBnZW5lcmF0ZVJhbmdlIH0gZnJvbSBcImF0b20tbGludGVyXCI7XG5pbXBvcnQgeyBMaW50UmVzdWx0LCBMaW50TWVzc2FnZSB9IGZyb20gXCIuL0VTbGludFR5cGVzLmQuanNcIjtcbmltcG9ydCBFU0xpbnQgZnJvbSBcImVzbGludFwiO1xuXG5jb25zdCBjbGlFbmdpbmU6IEVTTGludC5FU0xpbnQgPSBuZXcgRVNMaW50LkVTTGludCh7fSk7XG5cbmZ1bmN0aW9uIGJ5dGVzMlN0cmluZyhieXRlcykge1xuICBsZXQgcmVzdWx0ID0gXCJcIjtcbiAgZm9yIChsZXQgaSA9IDA7IGkgPCBieXRlcy5sZW5ndGg7IGkrKykge1xuICAgIHJlc3VsdCArPSBTdHJpbmcuZnJvbUNoYXJDb2RlKGJ5dGVzW2ldKTtcbiAgfVxuICByZXR1cm4gcmVzdWx0O1xufVxuXG5leHBvcnQgY29uc3QgY29uZmlnID0gQ29uZmlnO1xubGV0IG5leHRfcmVhZHkgPSBmYWxzZTtcbmxldCBlZGl0b3IgPSBudWxsO1xubGV0IHN0YXJ0X3RpbWUgPSBEYXRlLm5vdygpO1xuXG5mdW5jdGlvbiBwYXJzZUVycm9yc0FzeW5jKCkge1xuICBjb25zdCByZXN1bHRzID0gW107XG4gIGxldCBwYXJzaW5nID0gY3VycmVudF9lcnJvcnM7XG4gIGNvbnN0IG1lc3NhZ2VzOiBMaW50TWVzc2FnZVtdID0gW107XG4gIGxldCBmaWxlX3BhdGggPSBcIlwiO1xuICBwYXJzaW5nID0gcGFyc2luZy5zdWJzdHJpbmcoMCwgcGFyc2luZy5sYXN0SW5kZXhPZihcIiBwcm9ibGVtXCIpICsgMSk7XG4gIGxldCBxdHR5ID0gcGFyc2VJbnQocGFyc2luZy5zdWJzdHJpbmcocGFyc2luZy5sYXN0SW5kZXhPZihcIlxcblwiKSwgcGFyc2luZy5sZW5ndGggLSAxKSk7XG4gIGxldCBhcXR0eSA9IHBhcnNpbmcuc3Vic3RyaW5nKHBhcnNpbmcubGFzdEluZGV4T2YoXCJcXG5cIiksIHBhcnNpbmcubGVuZ3RoIC0gMSk7XG4gIHdoaWxlIChwYXJzaW5nLmxlbmd0aCA+IDAgJiYgcXR0eSA+IDApIHtcbiAgICAtLXF0dHk7XG4gICAgY29uc3QgZmlsZUFuZFdoZXJlID0gcGFyc2luZy5zdWJzdHJpbmcoMCwgcGFyc2luZy5pbmRleE9mKFwiIFwiKSk7XG4gICAgcGFyc2luZyA9IHBhcnNpbmcuc3Vic3RyaW5nKHBhcnNpbmcuaW5kZXhPZihcIiBcIikpO1xuXG4gICAgY29uc3QgbWVzc2FnZSA9IHBhcnNpbmcuc3Vic3RyaW5nKDAsIHBhcnNpbmcuaW5kZXhPZihcIlxcblwiKSk7XG4gICAgcGFyc2luZyA9IHBhcnNpbmcuc3Vic3RyaW5nKHBhcnNpbmcuaW5kZXhPZihcIlxcblwiKSArIDEpO1xuXG4gICAgY29uc3QgW2ZwLCBsaW5lLCBjb2x1bW4sIF9dID0gZmlsZUFuZFdoZXJlLnNwbGl0KFwiOlwiKTtcbiAgICBmaWxlX3BhdGggPSBmcDtcbiAgICBtZXNzYWdlcy5wdXNoKHtcbiAgICAgIG1lc3NhZ2U6IG1lc3NhZ2UsXG4gICAgICBsaW5lOiBOdW1iZXIobGluZSkgLSAxLFxuICAgICAgY29sdW1uOiBOdW1iZXIoY29sdW1uKSAtIDEsXG4gICAgICBydWxlSWQ6IG51bGwsXG4gICAgfSBhcyBMaW50TWVzc2FnZSk7XG4gIH1cbiAgcmVzdWx0cy5wdXNoKHtcbiAgICBmaWxlUGF0aDogZmlsZV9wYXRoLFxuICAgIG1lc3NhZ2VzOiBtZXNzYWdlcyxcbiAgICBlcnJvckNvdW50OiBtZXNzYWdlcy5sZW5ndGgsXG4gICAgZmF0YWxFcnJvckNvdW50OiAwLFxuICAgIHdhcm5pbmdDb3VudDogMCxcbiAgICBmaXhhYmxlRXJyb3JDb3VudDogMCxcbiAgICBmaXhhYmxlV2FybmluZ0NvdW50OiAwLFxuICB9IGFzIExpbnRSZXN1bHQpO1xuICByZXR1cm4gZnJvbUxpbnRUb0xpbnRlcihyZXN1bHRzKTtcbn1cblxuZnVuY3Rpb24gZnJvbUxpbnRUb0xpbnRlcihyZXN1bHRzOiBMaW50UmVzdWx0W10pOiBQcm9taXNlPGFueVtdPiB7XG4gIGNvbnN0IHByb21pc2VzID0gW107XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcmVzdWx0cy5sZW5ndGg7ICsraSkge1xuICAgIGZvciAobGV0IGogPSAwOyBqIDwgcmVzdWx0c1tpXS5tZXNzYWdlcy5sZW5ndGg7ICsraikge1xuICAgICAgcHJvbWlzZXMucHVzaCh7XG4gICAgICAgIHNldmVyaXR5OiBcImVycm9yXCIsIC8vIHJlc3VsdHNbaV0ubWVzc2FnZXNbal0uc2V2ZXJpdHksXG4gICAgICAgIGV4Y2VycHQ6IHJlc3VsdHNbaV0ubWVzc2FnZXNbal0ubWVzc2FnZSxcbiAgICAgICAgbG9jYXRpb246IHtcbiAgICAgICAgICBmaWxlOiByZXN1bHRzW2ldLmZpbGVQYXRoLFxuICAgICAgICAgIHBvc2l0aW9uOiBnZW5lcmF0ZVJhbmdlKGVkaXRvciwgcmVzdWx0c1tpXS5tZXNzYWdlc1tqXS5saW5lLCByZXN1bHRzW2ldLm1lc3NhZ2VzW2pdLmNvbHVtbiksXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShwcm9taXNlcyk7XG59XG5cbmZ1bmN0aW9uIHdhaXRUb1JlYWR5KCk6IFByb21pc2U8YW55W10+IHtcbiAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICBjb25zdCBpZCA9IHNldEludGVydmFsKCgpID0+IHtcbiAgICAgIGlmIChuZXh0X3JlYWR5IHx8IERhdGUubm93KCkgPiBzdGFydF90aW1lICsgMzAwMDApIHtcbiAgICAgICAgY2xlYXJJbnRlcnZhbChpZCk7XG4gICAgICAgIHJlc29sdmUocGFyc2VFcnJvcnNBc3luYygpKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59XG5cbmxldCBjdXJyZW50X2Vycm9ycyA9IFwiXCI7XG5sZXQgY3VycmVudF9yZXN1bHRzOiBQcm9taXNlPGFueVtdPiB8IG51bGwgPSBudWxsO1xuY29uc3QgY3VycmVudF9jb25maWcgPSBjb25maWc7XG5sZXQgcnVubmluZyA9IGZhbHNlO1xubGV0IGNoaWxkID0gbnVsbDtcblxuZnVuY3Rpb24gbG9nTm90aWZpY2F0aW9uKHRleHQsIHRpdHRsZSA9IFwiLS0gREVCVUcgLS1cIikge1xuICBjb25zdCBhcmdzID0geyBkaXNtaXNzYWJsZTogdGl0dGxlID09PSBcIi0tIERFQlVHIC0tXCIsIGRldGFpbDogdGV4dCB9O1xuICBhdG9tLm5vdGlmaWNhdGlvbnMuYWRkSW5mbyh0aXR0bGUsIGFyZ3MpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYWN0aXZhdGUoKSB7XG4gIGF0b20uY29tbWFuZHMuYWRkKFwiYXRvbS13b3Jrc3BhY2VcIiwge1xuICAgIFwiYXV0by1lc2xpbnQtcHJldHRpZXI6cnVuXCI6ICgpID0+IHtcbiAgICAgIHJ1bigpO1xuICAgIH0sXG4gIH0pO1xuXG4gIGF0b20ud29ya3NwYWNlLm9ic2VydmVUZXh0RWRpdG9ycygoZWRpdG9yKSA9PiB7XG4gICAgZWRpdG9yLm9uRGlkU2F2ZSgoKSA9PiB7XG4gICAgICBhdG9tLm5vdGlmaWNhdGlvbnMuY2xlYXIoKTtcbiAgICAgIGNvbnN0IGZpbGVzID0gZ2V0VmFsaWRGaWxlUGF0aHMoY3VycmVudF9jb25maWcucHJldHRpZXJGaWxlVHlwZS5nZXQoKSwgZ2V0Q3VycmVudEZpbGVQYXRoKCkpO1xuICAgICAgaWYgKGZpbGVzLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICAgICAgaWYgKHJ1bm5pbmcgJiYgY2hpbGQpIHtcbiAgICAgICAgY2hpbGQua2lsbCgpO1xuICAgICAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgICB9XG4gICAgICBpZiAoIXJ1bm5pbmcpIHtcbiAgICAgICAgaWYgKGN1cnJlbnRfY29uZmlnLm5vdGlmaWNhdGlvbnMuZ2V0KCkpIHtcbiAgICAgICAgICBsb2dOb3RpZmljYXRpb24oXCJcIiwgXCJSdW5uaW5nIGF1dG8tZXNsaW50LXByZXR0aWVyXCIpO1xuICAgICAgICB9XG4gICAgICAgIHJ1bm5pbmcgPSB0cnVlO1xuICAgICAgICBydW4oKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzZXJpYWxpemUoKSB7fVxuXG5leHBvcnQgZnVuY3Rpb24gcnVuKCkge1xuICBleGVjUHJldHRpZXIoZ2V0Q3VycmVudEZpbGVQYXRoKCkpO1xufVxuXG5mdW5jdGlvbiBnZXRDdXJyZW50V29ya2luZ0RpcihmaWxlcGF0aCkge1xuICBsZXQgY3dkO1xuICBhdG9tLnByb2plY3QuZ2V0RGlyZWN0b3JpZXMoKS5mb3JFYWNoKGZ1bmN0aW9uIChkaXIpIHtcbiAgICBjb25zdCBkaXJwYXRoID0gZGlyLmdldFBhdGgoKTtcbiAgICBjb25zdCByZWxwYXRoID0gcGF0aC5yZWxhdGl2ZShkaXJwYXRoLCBmaWxlcGF0aCk7XG4gICAgY29uc3QgZGlySXNQYXJlbnQgPSAhL15cXC5cXC5cXC8vLnRlc3QocmVscGF0aCk7XG4gICAgaWYgKGRpcklzUGFyZW50KSB7XG4gICAgICBjd2QgPSBkaXJwYXRoO1xuICAgIH1cbiAgfSk7XG4gIGN3ZCA9IGN3ZCB8fCBwcm9jZXNzLmN3ZCgpO1xuICByZXR1cm4gY3dkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q3VycmVudEZpbGVQYXRoKCkge1xuICAvLyBAdHMtZXhwZWN0LWVycm9yXG4gIHJldHVybiBhdG9tLndvcmtzcGFjZS5nZXRBY3RpdmVQYW5lSXRlbSgpLmdldFBhdGgoKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBhdGhUb0VTTGludChjd2QpIHtcbiAgaWYgKGN1cnJlbnRfY29uZmlnLmVzbGludFBhdGguZ2V0KCkpIHtcbiAgICByZXR1cm4gY3VycmVudF9jb25maWcuZXNsaW50UGF0aC5nZXQoKTtcbiAgfVxuICBpZiAoZnMuZXhpc3RzU3luYyhgJHtjd2R9L25vZGVfbW9kdWxlcy8uYmluL2VzbGludGApKSB7XG4gICAgcmV0dXJuIFwiLi9ub2RlX21vZHVsZXMvLmJpbi9lc2xpbnRcIjtcbiAgfVxuICByZXR1cm4gXCJlc2xpbnRcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFBhdGhUb1ByZXR0aWVyKGN3ZCkge1xuICBpZiAoY3VycmVudF9jb25maWcucHJldHRpZXJQYXRoLmdldCgpKSB7XG4gICAgcmV0dXJuIGN1cnJlbnRfY29uZmlnLnByZXR0aWVyUGF0aC5nZXQoKTtcbiAgfVxuICBpZiAoZnMuZXhpc3RzU3luYyhgJHtjd2R9L25vZGVfbW9kdWxlcy8uYmluL3ByZXR0aWVyYCkpIHtcbiAgICByZXR1cm4gXCIuL25vZGVfbW9kdWxlcy8uYmluL3ByZXR0aWVyXCI7XG4gIH1cbiAgcmV0dXJuIFwicHJldHRpZXJcIjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFZhbGlkRmlsZVBhdGhzKGZpbGVUeXBlLCBmaWxlcGF0aCkge1xuICBjb25zdCBmaWxlcyA9IFtdO1xuICBjb25zdCBwYXRocyA9IGZpbGVwYXRoIGluc3RhbmNlb2YgQXJyYXkgPyBmaWxlcGF0aC5zbGljZSgpIDogW2ZpbGVwYXRoXTtcbiAgY29uc3QgcmV4ID0gbmV3IFJlZ0V4cChcIlxcXFwuKFwiICsgZmlsZVR5cGUucmVwbGFjZSgvXFxzKixcXHMqL2csIFwifFwiKSArIFwiKSRcIik7XG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcGF0aHMubGVuZ3RoOyArK2kpIHtcbiAgICBpZiAocmV4LnRlc3QocGF0aHNbaV0pKSB7XG4gICAgICBmaWxlcy5wdXNoKHBhdGhzW2ldKTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGZpbGVzO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZXhlY1ByZXR0aWVyKGZpbGVwYXRoKSB7XG4gIGNvbnN0IGFyZ3MgPSBnZXRWYWxpZEZpbGVQYXRocyhjdXJyZW50X2NvbmZpZy5wcmV0dGllckZpbGVUeXBlLmdldCgpLCBmaWxlcGF0aCk7XG4gIGlmIChhcmdzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cbiAgYXJncy51bnNoaWZ0KFwiLXdcIik7XG4gIGFyZ3MudW5zaGlmdChcIi0tY2FjaGVcIik7XG4gIGNvbnN0IGN3ZCA9IGdldEN1cnJlbnRXb3JraW5nRGlyKGZpbGVwYXRoKTtcbiAgY29uc3QgcnVubmVyID0gZ2V0UGF0aFRvUHJldHRpZXIoY3dkKTtcbiAgY2xpRXhlYyhjd2QsIHJ1bm5lciwgYXJncywgKCkgPT4ge1xuICAgIGV4ZWNFc2xpbnQoZmlsZXBhdGgpO1xuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGV4ZWNFc2xpbnQoZmlsZXBhdGgpIHtcbiAgY29uc3QgYXJncyA9IGdldFZhbGlkRmlsZVBhdGhzKGN1cnJlbnRfY29uZmlnLmVzbGludEZpbGVUeXBlLmdldCgpLCBmaWxlcGF0aCk7XG4gIGlmIChhcmdzLmxlbmd0aCA9PT0gMCkge1xuICAgIHJ1bm5pbmcgPSBmYWxzZTtcbiAgICByZXR1cm47XG4gIH1cbiAgYXJncy51bnNoaWZ0KFwiLS1maXhcIik7XG4gIGFyZ3MudW5zaGlmdChcIi0tY2FjaGVcIik7XG4gIGFyZ3MudW5zaGlmdChcIi0tbm8taWdub3JlXCIpO1xuICBhcmdzLnVuc2hpZnQoXCItLWZvcm1hdD11bml4XCIpO1xuXG4gIGNvbnN0IGN3ZCA9IGdldEN1cnJlbnRXb3JraW5nRGlyKGZpbGVwYXRoKTtcbiAgY29uc3QgcnVubmVyID0gZ2V0UGF0aFRvRVNMaW50KGN3ZCk7XG4gIGNsaUV4ZWMoY3dkLCBydW5uZXIsIGFyZ3MsICgpID0+IHt9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNsaUV4ZWMoY3dkLCBydW5uZXIsIGFyZywgY2FsbGJhY2spIHtcbiAgaWYgKHJ1bm5lci5pbmNsdWRlcyhcImVzbGludFwiKSkge1xuICAgIC8vIGNvbnN0IGZpbGUgPSBhcmdbYXJnLmxlbmd0aCAtIDFdO1xuICAgIC8vIGNvbnN0IHBhcnNlRXJyb3JzQXN5bmMgPSAocmVzdWx0OiBhbnlbXSkgPT4ge1xuICAgIC8vICAgICBjb25zdCByZXN1bHQyID0gY2xpRW5naW5lLmxpbnRGaWxlcyhmaWxlKSBhcyBhbnkgYXMgTGludFJlc3VsdFtdO1xuICAgIC8vICAgICByZXR1cm4gcmVzdWx0LmNvbmNhdChyZXN1bHQyKTtcbiAgICAvLyAgIH07XG4gICAgLy9cbiAgICAvLyBpZiAoY3VycmVudF9yZXN1bHRzICE9IG51bGwpIHtcbiAgICAvLyAgIGN1cnJlbnRfcmVzdWx0cy50aGVuKHBhcnNlRXJyb3JzQXN5bmMpO1xuICAgIC8vIH1cbiAgfVxuXG4gIGNoaWxkID0gZXhlY0ZpbGUocnVubmVyLCBhcmcsIHsgY3dkLCBzaGVsbDogZmFsc2UgfSwgKGVycm9yLCBzdGRvdXQsIHN0ZGVycikgPT4ge1xuICAgIGNvbnN0IG91dCA9IHN0ZG91dDtcbiAgICBjb25zdCBlcnIgPSBzdGRlcnI7XG4gICAgY29uc3QgYXJncyA9IHsgZGV0YWlsOiBlcnIgPyBlcnIgKyBcIlxcblwiICsgb3V0IDogb3V0LCBkaXNtaXNzYWJsZTogZmFsc2UgfTtcbiAgICBjb25zdCBub3RpZiA9IGVycm9yID8gY3VycmVudF9jb25maWcuemVycm9yLmdldCgpIDogY3VycmVudF9jb25maWcueXN1Y2Nlc3MuZ2V0KCk7XG4gICAgaWYgKGN1cnJlbnRfY29uZmlnLm5vdGlmaWNhdGlvbnMuZ2V0KCkpIHtcbiAgICAgIGxvZ05vdGlmaWNhdGlvbihcIlwiLCBydW5uZXIgKyBcIiBjb21wbGVhdGVkXCIpO1xuICAgIH1cbiAgICBpZiAocnVubmVyLmluY2x1ZGVzKFwiZXNsaW50XCIpKSB7XG4gICAgICBjdXJyZW50X2Vycm9ycyA9IG91dDtcbiAgICAgIGlmIChjdXJyZW50X3Jlc3VsdHMgIT0gbnVsbCkge1xuICAgICAgICBjdXJyZW50X3Jlc3VsdHMudGhlbihwYXJzZUVycm9yc0FzeW5jKTtcbiAgICAgIH1cbiAgICAgIG5leHRfcmVhZHkgPSB0cnVlO1xuICAgIH1cbiAgICBydW5uaW5nID0gZmFsc2U7XG4gICAgY2hpbGQgPSBudWxsO1xuICAgIGNhbGxiYWNrKCk7XG4gICAgLy8gbm90aWZpY2F0aW9ucyBoYW5kbGVcbiAgICBpZiAobm90aWYudHlwZSA9PT0gXCJub25lXCIpIHtcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2UgaWYgKG5vdGlmLnR5cGUgPT09IFwiZGlzbWlzc2FibGVcIiAmJiBlcnIubGVuZ3RoICsgb3V0Lmxlbmd0aCA+IDApIHtcbiAgICAgIGFyZ3MuZGlzbWlzc2FibGUgPSB0cnVlO1xuICAgIH1cbiAgICBpZiAoZXJyb3IpIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRFcnJvcihydW5uZXIgKyBcIiBmYWlsZWRcIiwgYXJncyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF0b20ubm90aWZpY2F0aW9ucy5hZGRTdWNjZXNzKHJ1bm5lciArIFwiIHN1Y2Nlc3NmdWxcIiwgYXJncyk7XG4gICAgfVxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHByb3ZpZGVMaW50ZXIoKSB7XG4gIHJldHVybiB7XG4gICAgbmFtZTogXCJFc2xpbnRcIixcbiAgICBncmFtbWFyU2NvcGVzOiBbXCJzb3VyY2UudHNcIl0sXG4gICAgc2NvcGU6IFwiZmlsZVwiLFxuICAgIGxpbnRzT25DaGFuZ2U6IGZhbHNlLFxuICAgIGxpbnQ6IChjdXJyZW50X2VkaXRvcik6IFByb21pc2U8YW55W10+ID0+IHtcbiAgICAgIGVkaXRvciA9IGN1cnJlbnRfZWRpdG9yO1xuICAgICAgbmV4dF9yZWFkeSA9IGZhbHNlO1xuICAgICAgc3RhcnRfdGltZSA9IERhdGUubm93KCk7XG4gICAgICBjdXJyZW50X3Jlc3VsdHMgPSB3YWl0VG9SZWFkeSgpO1xuICAgICAgcmV0dXJuIGN1cnJlbnRfcmVzdWx0cztcbiAgICB9LFxuICB9O1xufVxuIl19