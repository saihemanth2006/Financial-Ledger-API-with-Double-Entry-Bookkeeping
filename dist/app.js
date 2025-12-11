"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};

// Account A1 ID: edc231d4-a70d-46d6-9347-cb23b26b7def
// Account A2 ID: 46cccb4a-96b2-4027-98d0-35b890317794

Object.defineProperty(exports, "__esModule", { value: true });
// src/app.ts
const express_1 = __importDefault(require("express"));
const body_parser_1 = __importDefault(require("body-parser"));
const accountControllers_1 = require("./controllers/accountControllers");
const transactionController_1 = require("./controllers/transactionController");
const app = (0, express_1.default)();
app.use(body_parser_1.default.json());
app.use('/api', accountControllers_1.router);
app.use('/api', transactionController_1.router);
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'internal_error' });
});
exports.default = app;
