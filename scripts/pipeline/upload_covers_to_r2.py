#!/usr/bin/env python3
"""
scripts/pipeline/upload_covers_to_r2.py
--------------------------------------------------------------------------------
Uploads downloaded cover images to Cloudflare R2 bucket (`lidex-covers/covers/`).

Reads credentials from environment variables or .env.local:
    CF_ACCOUNT_ID        (or CLOUDFLARE_ACCOUNT_ID)
    CF_ACCESS_KEY        (or CLOUDFLARE_R2_ACCESS_KEY_ID)
    CF_SECRET_KEY        (or CLOUDFLARE_R2_SECRET_ACCESS_KEY)
    CF_BUCKET_NAME       (default: 'lidex-covers')
    CF_PUBLIC_URL        (default: 'https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev')

Usage:
    python scripts/pipeline/upload_covers_to_r2.py
    python scripts/pipeline/upload_covers_to_r2.py --covers-dir="data/covers" --dry-run
--------------------------------------------------------------------------------
"""

import os
import sys
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from dotenv import dotenv_values

sys.stdout.reconfigure(encoding='utf-8')

DEFAULT_COVERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "covers")
DEFAULT_BUCKET = "lidex-covers"
DEFAULT_PUBLIC_URL = "https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev"


def get_r2_config():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env.local")
    env = dotenv_values(env_path) if os.path.exists(env_path) else {}

    account_id = os.environ.get("CF_ACCOUNT_ID") or os.environ.get("CLOUDFLARE_ACCOUNT_ID") or env.get("CF_ACCOUNT_ID") or env.get("CLOUDFLARE_ACCOUNT_ID")
    access_key = os.environ.get("CF_ACCESS_KEY") or os.environ.get("CLOUDFLARE_R2_ACCESS_KEY_ID") or env.get("CF_ACCESS_KEY") or env.get("CLOUDFLARE_R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("CF_SECRET_KEY") or os.environ.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY") or env.get("CF_SECRET_KEY") or env.get("CLOUDFLARE_R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("CF_BUCKET_NAME") or env.get("CF_BUCKET_NAME") or DEFAULT_BUCKET
    public_url = os.environ.get("CF_PUBLIC_URL") or env.get("CF_PUBLIC_URL") or DEFAULT_PUBLIC_URL

    return {
        "account_id": account_id,
        "access_key": access_key,
        "secret_key": secret_key,
        "bucket": bucket,
        "public_url": public_url.rstrip("/"),
    }


def get_s3_client(config):
    import boto3
    from botocore.config import Config

    endpoint = f"https://{config['account_id']}.r2.cloudflarestorage.com"
    return boto3.client(
        service_name="s3",
        endpoint_url=endpoint,
        aws_access_key_id=config["access_key"],
        aws_secret_access_key=config["secret_key"],
        region_name="auto",
        verify=False,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"})
    )


def upload_single_file(client, bucket: str, file_path: Path, object_key: str, dry_run: bool = False) -> tuple[str, bool, str]:
    if dry_run:
        return object_key, True, "dry-run"
    
    try:
        # Check if already exists on R2
        try:
            client.head_object(Bucket=bucket, Key=object_key)
            return object_key, True, "already-exists"
        except Exception:
            pass  # Does not exist, proceed to upload

        client.upload_file(
            Filename=str(file_path),
            Bucket=bucket,
            Key=object_key,
            ExtraArgs={
                "ContentType": "image/jpeg",
                "CacheControl": "public, max-age=31536000, immutable",
            }
        )
        return object_key, True, "uploaded"
    except Exception as e:
        return object_key, False, str(e)


def upload_all_covers(covers_dir: str = DEFAULT_COVERS_DIR, dry_run: bool = False, max_workers: int = 16):
    config = get_r2_config()
    
    dir_path = Path(covers_dir)
    if not dir_path.exists():
        print(f"[ERROR] Covers directory not found: {dir_path.resolve()}", file=sys.stderr)
        return False

    files = [f for f in dir_path.iterdir() if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    print(f"Found {len(files)} image files in {dir_path.resolve()}")
    
    if not (config["account_id"] and config["access_key"] and config["secret_key"]):
        print("\n⚠️  [NOTICE] Cloudflare R2 credentials not found in environment or .env.local.")
        print("To enable automatic upload, add the following to your .env.local file:")
        print("    CF_ACCOUNT_ID=your_cloudflare_account_id")
        print("    CF_ACCESS_KEY=your_r2_access_key_id")
        print("    CF_SECRET_KEY=your_r2_secret_access_key")
        print("    CF_BUCKET_NAME=lidex-covers")
        print("    CF_PUBLIC_URL=https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev\n")
        print(f"Alternative: You can manually upload the contents of '{dir_path.resolve()}'")
        print(f"into your Cloudflare R2 bucket '{config['bucket']}' inside the 'covers/' prefix.")
        return False

    s3_client = get_s3_client(config)
    print(f"Connected to Cloudflare R2 bucket: {config['bucket']}")
    print(f"Target key prefix: covers/<filename>")

    upload_tasks = []
    for f in files:
        key = f"covers/{f.name}"
        upload_tasks.append((f, key))

    uploaded = 0
    cached = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {
            executor.submit(upload_single_file, s3_client, config["bucket"], path, key, dry_run): key
            for path, key in upload_tasks
        }

        for future in as_completed(futures):
            key, success, status = future.result()
            if success:
                if status == "already-exists":
                    cached += 1
                elif status == "uploaded":
                    uploaded += 1
                elif status == "dry-run":
                    uploaded += 1
            else:
                failed += 1
                print(f"  ❌ Failed to upload {key}: {status}")

            done = uploaded + cached + failed
            if done % 100 == 0 or done == len(upload_tasks):
                print(f"Upload progress: {done}/{len(upload_tasks)} (Uploaded: {uploaded}, Exists: {cached}, Failed: {failed})")

    print("\n=== R2 Upload Summary ===")
    print(f"  - Total files:    {len(upload_tasks)}")
    print(f"  - Uploaded:       {uploaded}")
    print(f"  - Already exists: {cached}")
    print(f"  - Failed:         {failed}")
    print(f"  - Public URL base:{config['public_url']}/covers/")
    return failed == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload cover images to Cloudflare R2")
    parser.add_argument("--covers-dir", default=DEFAULT_COVERS_DIR, help="Directory containing images to upload")
    parser.add_argument("--dry-run", action="store_true", help="Preview without uploading")
    parser.add_argument("--workers", type=int, default=16, help="Concurrent worker threads")
    args = parser.parse_args()

    upload_all_covers(covers_dir=args.covers_dir, dry_run=args.dry_run, max_workers=args.workers)
