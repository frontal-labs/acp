use std::env;
use std::fs;
use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest dir"));
    let proto_root = manifest_dir.join("../../proto");
    let generated_dir = manifest_dir.join("src/generated");
    println!("cargo:rerun-if-changed={}", proto_root.display());

    // A published crate ships src/generated and does not contain the repository proto sources.
    if !proto_root.join("v1/api/events.proto").exists() {
        return;
    }

    fs::create_dir_all(&generated_dir).expect("create Rust protobuf output directory");

    let mut config = prost_build::Config::new();
    config.out_dir(&generated_dir);
    config.include_file("mod.rs");
    // Deterministic map order so re-encoding matches the TypeScript and Python encoders.
    config.btree_map(["."]);
    config
        .compile_protos(
            &[proto_root.join("v1/api/events.proto"), proto_root.join("v2/api/events.proto")],
            std::slice::from_ref(&proto_root),
        )
        .expect("compile OCP protobuf definitions");
}
