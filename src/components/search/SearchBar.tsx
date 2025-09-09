import React from "react";
import { useSearch } from "@/contexts/SearchContext";

export function SearchBar() {
  const { searchQuery, searchResults, setSearchQuery, clearSearch, isSearching } = useSearch();

  return (
    <div className="p-4">
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search users..."
        className="border p-2 rounded-md w-full"
      />
      {isSearching && <p className="mt-2 text-sm text-gray-600">Searching...</p>}
      {(!!searchResults && searchResults?.length > 0) && (
        <ul className="mt-2 border rounded-md">
          {searchResults.map(user => (
            <li key={user.id} className="p-2 border-b last:border-0">
              {user.displayName} - <span className="text-xs text-gray-500">{user.statusMessage}</span>
            </li>
          ))}
        </ul>
      )}
      {searchQuery && (
        <button
          onClick={clearSearch}
          className="mt-2 text-sm text-blue-600 underline"
        >
          Clear
        </button>
      )}
    </div>
  );
}

export default SearchBar;
