export declare const useCounter: () => {
    readonly increment: () => Promise<void>;
    readonly decrement: () => Promise<void>;
    readonly count: number;
    readonly username: string | null;
    readonly loading: boolean;
};
