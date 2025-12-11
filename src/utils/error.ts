// src/utils/error.ts

export class ApiError extends Error {
	status: number;
	code?: string;

	constructor(status: number, message: string, code?: string) {
		super(message);
		this.status = status;
		this.code = code;
		Object.setPrototypeOf(this, ApiError.prototype);
	}
}

export default ApiError;
