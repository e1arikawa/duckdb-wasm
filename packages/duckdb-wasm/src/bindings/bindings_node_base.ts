import DuckDBWasm from './duckdb_wasm.js';
import { DuckDBModule } from './duckdb_module';
import { DuckDBBindings } from './bindings';
import { DuckDBRuntime } from './runtime_base';
import { Logger } from '../log';
import fs from 'fs';

declare global {
    // eslint-disable-next-line no-var
    var DuckDBTrampoline: any;
}

/** DuckDB bindings for node.js */
export class DuckDBNodeBindings extends DuckDBBindings {
    /** The path of the wasm module */
    protected mainModulePath: string;
    /** The path of the pthread worker script */
    protected pthreadWorkerPath: string | null;

    /** Constructor */
    public constructor(
        logger: Logger,
        runtime: DuckDBRuntime,
        mainModulePath: string,
        pthreadWorkerPath: string | null,
    ) {
        super(logger, runtime);
        this.mainModulePath = mainModulePath;
        this.pthreadWorkerPath = pthreadWorkerPath;
    }

    /** Locate a file */
    protected locateFile(path: string, prefix: string): string {
        if (path.endsWith('.wasm')) {
            return this.mainModulePath;
        }
        if (path.endsWith('.worker.js')) {
            if (!this.pthreadWorkerPath) {
                throw new Error('Missing DuckDB worker path!');
            }
            return this.pthreadWorkerPath!;
        }
        throw new Error(`WASM instantiation requested unexpected file: prefix=${prefix} path=${path}`);
    }

    /** Instantiate the wasm module */
    protected instantiateWasm(
        // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
        imports: any,
        success: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
    ): Emscripten.WebAssemblyExports {
        const imports_rt: WebAssembly.Imports = {
            ...imports,
            env: {
                ...imports.env,
            },
        };
        const buf = fs.readFileSync(this.mainModulePath);
        WebAssembly.instantiate(buf, imports_rt).then(output => {
            globalThis.DuckDBTrampoline = {};

            for (const func of Object.getOwnPropertyNames(this._runtime)) {
                if (func == 'constructor') continue;
                globalThis.DuckDBTrampoline[func] = Object.getOwnPropertyDescriptor(this._runtime, func)!.value;
            }
            success(output.instance, output.module);
        });
        return [];
    }

    /** Instantiate the bindings */
    protected instantiate(moduleOverrides: Partial<DuckDBModule>): Promise<DuckDBModule> {
        return DuckDBWasm({
            ...moduleOverrides,
            instantiateWasm: this.instantiateWasm.bind(this),
        });
    }
}
