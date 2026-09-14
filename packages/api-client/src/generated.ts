/* Generated from API Zod schemas. Do not edit. */
export interface paths {
    "/api/v1/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Current progress generation */
        get: operations["getSession"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Local runtime capability */
        get: operations["getHealth"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/heatmap": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getHeatmap"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/skills": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getSkillAnalytics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/evolution": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getEvolution"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/curriculum": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getCurriculum"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recommendations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getRecommendations"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recommendations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getRecommendation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/attempts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post: operations["createAttempt"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/analytics/summary": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get: operations["getAnalytics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/progress": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete: operations["resetProgress"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    getSession: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current progress generation; Cache-Control: no-store. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getHealth: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Database available; provider may be degraded. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "healthy" | "degraded" | "unhealthy";
                        /** @enum {string} */
                        database: "up" | "down" | "unconfigured";
                        /** @enum {string} */
                        provider: "available" | "degraded" | "unknown";
                    };
                };
            };
            /** @description Database unavailable or not configured. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "healthy" | "degraded" | "unhealthy";
                        /** @enum {string} */
                        database: "up" | "down" | "unconfigured";
                        /** @enum {string} */
                        provider: "available" | "degraded" | "unknown";
                    };
                };
            };
        };
    };
    getHeatmap: {
        parameters: {
            query: {
                timezone: string;
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Stored local-date activity. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        heatmap: {
                            /** Format: date */
                            date: string;
                            count: number;
                        }[];
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getSkillAnalytics: {
        parameters: {
            query: {
                timezone: string;
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Skill and difficulty distributions. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        bySkill: {
                            key: string;
                            count: number;
                        }[];
                        byDifficulty: {
                            key: string;
                            count: number;
                        }[];
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getEvolution: {
        parameters: {
            query: {
                timezone: string;
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attempt evolution. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        evolution: {
                            /** Format: date */
                            date: string;
                            attempts: number;
                            cumulative: number;
                        }[];
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getCurriculum: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Current curriculum progress. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        name: string;
                        progressPercentage: number | null;
                        completedAnchors: number;
                        totalAnchors: number;
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getRecommendations: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Persisted active recommendations. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        items: {
                            /** Format: uuid */
                            id: string;
                            /** @enum {string} */
                            provider: "leetcode";
                            providerProblemId: string;
                            frontendId: string;
                            title: string;
                            slug: string;
                            /** Format: uri */
                            url: string;
                            /** @enum {string} */
                            difficulty: "Easy" | "Medium" | "Hard";
                            primarySkill: {
                                slug: string;
                                name: string;
                            };
                            tags: string[];
                            /** @enum {string} */
                            reason: "REVIEW" | "PROGRESSION" | "REVALIDATION";
                            /** Format: date-time */
                            issuedAt: string;
                            /** @enum {string} */
                            status: "ACTIVE" | "COMPLETED" | "REPLACED" | "INVALIDATED";
                            recordable: boolean;
                        }[];
                        refill: {
                            /** @enum {string} */
                            status: "READY" | "REFILLING" | "SHORTAGE";
                            targetSize: number;
                            reason: string | null;
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getRecommendation: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Issued recommendation snapshot. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        id: string;
                        /** @enum {string} */
                        provider: "leetcode";
                        providerProblemId: string;
                        frontendId: string;
                        title: string;
                        slug: string;
                        /** Format: uri */
                        url: string;
                        /** @enum {string} */
                        difficulty: "Easy" | "Medium" | "Hard";
                        primarySkill: {
                            slug: string;
                            name: string;
                        };
                        tags: string[];
                        /** @enum {string} */
                        reason: "REVIEW" | "PROGRESSION" | "REVALIDATION";
                        /** Format: date-time */
                        issuedAt: string;
                        /** @enum {string} */
                        status: "ACTIVE" | "COMPLETED" | "REPLACED" | "INVALIDATED";
                        recordable: boolean;
                        /** Format: uuid */
                        generation: string;
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    createAttempt: {
        parameters: {
            query?: never;
            header: {
                "idempotency-key": string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    recommendationId: string;
                    /** Format: uuid */
                    generation: string;
                    /** @enum {string} */
                    feedbackSchemaVersion: "feedback-v1";
                    answers: {
                        /** @enum {string} */
                        independence: "FAILED" | "FULL_SOLUTION" | "SUBSTANTIAL_HELP" | "ONE_HINT" | "INDEPENDENT";
                        /** @enum {string} */
                        recognition: "NOT_RECOGNIZED" | "AFTER_HELP" | "INDEPENDENT";
                        /** @enum {string} */
                        implementation: "UNABLE" | "MAJOR_DIFFICULTY" | "MINOR_DIFFICULTY" | "SMOOTH";
                        /** @enum {string} */
                        complexity: "UNABLE" | "PARTIAL" | "CORRECT";
                    };
                    durationSeconds?: number | null;
                    timezone: string;
                };
            };
        };
        responses: {
            /** @description Idempotent replay. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        attempt: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            recommendationId: string;
                            /** Format: date-time */
                            completedAt: string;
                            /** Format: date */
                            completedLocalDate: string;
                            durationSeconds: number | null;
                            score: number;
                            /** @enum {string} */
                            rating: "AGAIN" | "HARD" | "GOOD" | "EASY";
                        };
                    };
                };
            };
            /** @description Attempt saved. */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        attempt: {
                            /** Format: uuid */
                            id: string;
                            /** Format: uuid */
                            recommendationId: string;
                            /** Format: date-time */
                            completedAt: string;
                            /** Format: date */
                            completedLocalDate: string;
                            durationSeconds: number | null;
                            score: number;
                            /** @enum {string} */
                            rating: "AGAIN" | "HARD" | "GOOD" | "EASY";
                        };
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            404: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    getAnalytics: {
        parameters: {
            query: {
                timezone: string;
                from?: string;
                to?: string;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Attempt-based analytics. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                        uniqueProblems: number;
                        totalAttempts: number;
                        currentStreak: number;
                        longestStreak: number;
                        medianDurationSeconds: number | null;
                        heatmap: {
                            /** Format: date */
                            date: string;
                            count: number;
                        }[];
                        bySkill: {
                            key: string;
                            count: number;
                        }[];
                        byDifficulty: {
                            key: string;
                            count: number;
                        }[];
                        feedback: {
                            independence: {
                                key: string;
                                count: number;
                            }[];
                            recognition: {
                                key: string;
                                count: number;
                            }[];
                            implementation: {
                                key: string;
                                count: number;
                            }[];
                            complexity: {
                                key: string;
                                count: number;
                            }[];
                        };
                        evolution: {
                            /** Format: date */
                            date: string;
                            attempts: number;
                            cumulative: number;
                        }[];
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
    resetProgress: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    confirmation: "RESET";
                    /** Format: uuid */
                    generation: string;
                };
            };
        };
        responses: {
            /** @description Progress reset. */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uuid */
                        generation: string;
                    };
                };
            };
            /** @description Application error. */
            400: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            409: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            500: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
            /** @description Application error. */
            503: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        error: {
                            code: string;
                            message: string;
                            details?: unknown[];
                        };
                    };
                };
            };
        };
    };
}
