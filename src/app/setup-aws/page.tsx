// app/setup-aws/page.tsx
'use client';
import React, { useState } from "react";

export default function SetupAWSPage() {
  const [awsRegion, setAwsRegion] = useState("us-east-1");
  const [s3Bucket, setS3Bucket] = useState("my-app-bucket");
  const [apiEndpoint, setApiEndpoint] = useState("https://api.example.com");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Here, add integration to update AWS settings via API or configuration management
    setMessage("AWS configuration updated successfully.");
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">AWS Configuration Setup</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">AWS Region</label>
          <input
            type="text"
            value={awsRegion}
            onChange={(e) => setAwsRegion(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">S3 Bucket</label>
          <input
            type="text"
            value={s3Bucket}
            onChange={(e) => setS3Bucket(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">API Endpoint</label>
          <input
            type="text"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md"
        >
          Update Configuration
        </button>
      </form>
      {message && <p className="mt-4 text-green-600">{message}</p>}
    </div>
  );
}
