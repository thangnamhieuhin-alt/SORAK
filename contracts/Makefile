.PHONY: test build optimize lint clean

test:
	cargo test

build:
	stellar contract build

optimize:
	stellar contract optimize --wasm target/wasm32-unknown-unknown/release/*.wasm

lint:
	cargo clippy -- -D warnings

clean:
	cargo clean
