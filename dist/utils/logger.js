"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const debug_1 = __importDefault(require("debug"));
exports.logger = {
    info: (0, debug_1.default)("bfc:info"),
    error: (0, debug_1.default)("bfc:error"),
    debug: (0, debug_1.default)("bfc:debug"),
    trace: (0, debug_1.default)("bfc:trace"),
};
