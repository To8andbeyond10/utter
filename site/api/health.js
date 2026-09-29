// Quick check that the site is deployed and storage is connected.
export default function handler(req, res) {
  res.status(200).json({ ok: true, storage: Boolean(process.env.BLOB_READ_WRITE_TOKEN) });
}
