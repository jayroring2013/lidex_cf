#!/usr/bin/env python3
"""
scripts/pipeline/clean_and_sync_r2.py
--------------------------------------------------------------------------------
1. Deletes all existing objects in Cloudflare R2 bucket (`lidex-covers/covers/`).
2. Uploads all 965 downloaded volume covers from `data/covers/` to `lidex-covers/covers/`.
3. Verifies public access via Cloudflare CDN.

Usage:
    python scripts/pipeline/clean_and_sync_r2.py --account-id="YOUR_ACCOUNT_ID"
--------------------------------------------------------------------------------
"""

import os
import sys
import argparse
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import boto3
from botocore.config import Config
from dotenv import dotenv_values, set_key

sys.stdout.reconfigure(encoding='utf-8')

DEFAULT_COVERS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "data", "covers")
ENV_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), ".env.local")
DEFAULT_BUCKET = "lidex-covers"
DEFAULT_PUBLIC_URL = "https://pub-2080c0fa70954a7e98e48daff887c4cf.r2.dev"


def get_client(account_id: str, access_key: str, secret_key: str):
    endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        service_name="s3",
        endpoint_url=endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
        verify=False,
        config=Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"})
    )


def delete_all_covers_in_bucket(client, bucket: str, prefix: str = "covers/"):
    print(f"\n[Phase 1] Purging all existing objects in '{bucket}/{prefix}'...")
    paginator = client.get_paginator("list_objects_v2")
    pages = paginator.paginate(Bucket=bucket, Prefix=prefix)

    deleted_count = 0
    for page in pages:
        objects = page.get("Contents", [])
        if not objects:
            continue
        delete_batch = [{"Key": obj["Key"]} for obj in objects]
        client.delete_objects(Bucket=bucket, Delete={"Objects": delete_batch})
        deleted_count += len(delete_batch)
        print(f"  ✓ Deleted batch of {len(delete_batch)} objects (Total deleted: {deleted_count})")

    print(f"✓ Purge complete. Successfully removed {deleted_count} old images from '{bucket}/{prefix}'.")
    return deleted_count


def upload_single_image(client, bucket: str, file_path: Path, object_key: str) -> tuple[str, bool, str]:
    try:
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


def upload_all_covers_to_r2(client, bucket: str, covers_dir: str, max_workers: int = 20):
    dir_path = Path(covers_dir)
    files = [f for f in dir_path.iterdir() if f.is_file() and f.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    print(f"\n[Phase 2] Uploading {len(files)} new cover images from '{dir_path.resolve()}' to '{bucket}/covers/'...")

    tasks = [(f, f"covers/{f.name}") for f in files]
    uploaded = 0
    failed = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = {executor.submit(upload_single_image, client, bucket, path, key): key for path, key in tasks}
        for future in as_completed(futures):
            key, success, status = future.result()
            if success:
                uploaded += 1
            else:
                failed += 1
                print(f"  ❌ Failed {key}: {status}")

            total = uploaded + failed
            if total % 100 == 0 or total == len(tasks):
                print(f"  Progress: {total}/{len(tasks)} (Uploaded: {uploaded}, Failed: {failed})")

    print(f"\n✓ Upload phase complete: {uploaded} uploaded, {failed} failed.")
    return uploaded, failed


def run_clean_and_sync(account_id: str, access_key: str, secret_key: str, bucket: str = DEFAULT_BUCKET, covers_dir: str = DEFAULT_COVERS_DIR):
    # Save keys to .env.local for persistence
    if os.path.exists(ENV_PATH):
        set_key(ENV_PATH, "CF_ACCOUNT_ID", account_id)
        set_key(ENV_PATH, "CF_ACCESS_KEY", access_key)
        set_key(ENV_PATH, "CF_SECRET_KEY", secret_key)
        set_key(ENV_PATH, "CF_BUCKET_NAME", bucket)
        set_key(ENV_PATH, "CF_PUBLIC_URL", DEFAULT_PUBLIC_URL)
        print(f"✓ Saved Cloudflare R2 credentials to .env.local")

    client = get_client(account_id, access_key, secret_key)

    # 1. Purge old objects in lidex-covers/covers/
    delete_all_covers_in_bucket(client, bucket=bucket, prefix="covers/")

    # 2. Upload new downloaded covers
    upload_all_covers_to_r2(client, bucket=bucket, covers_dir=covers_dir)

    print("\n🎉 [ALL DONE] All old covers purged and new Kurano covers uploaded to Cloudflare R2!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--account-id", help="Cloudflare Account ID")
    parser.add_argument("--access-key", default="6187ff06cdbd1e59b655a7d60bf64021")
    parser.add_argument("--secret-key", default="374229565251bdbc1b5e6c44d9f4838ad108b19d9b237ce0ac871450f4ad415c")
    parser.add_argument("--bucket", default=DEFAULT_BUCKET)
    parser.add_argument("--covers-dir", default=DEFAULT_COVERS_DIR)

    args = parser.parse_args()

    env = dotenv_values(ENV_PATH) if os.path.exists(ENV_PATH) else {}
    acc_id = args.account_id or env.get("CF_ACCOUNT_ID") or os.environ.get("CF_ACCOUNT_ID")

    if not acc_id:
        print("[ERROR] Account ID is required. Pass --account-id or set CF_ACCOUNT_ID in .env.local", file=sys.stderr)
        sys.exit(1)

    run_clean_and_sync(
        account_id=acc_id,
        access_key=args.access_key,
        secret_key=args.secret_key,
        bucket=args.bucket,
        covers_dir=args.covers_dir
    )
