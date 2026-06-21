import React, { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

const defaultGetOptionValue = (option) => option?.id ?? '';
const defaultGetOptionLabel = (option) =>
  option?.label || option?.name || option?.productName || option?.customerName || '';

const SearchableSelect = ({
  options = [],
  value = '',
  onChange,
  placeholder = 'Search...',
  disabled = false,
  required = false,
  maxResults = 8,
  noResultsText = 'No results found',
  getOptionValue = defaultGetOptionValue,
  getOptionLabel = defaultGetOptionLabel,
  getOptionSubLabel,
  getOptionSearchText,
  inputClassName = '',
  menuClassName = ''
}) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const blurTimeoutRef = useRef(null);
  const deferredQuery = useDeferredValue(query);

  const selectedOption = useMemo(
    () => options.find((option) => getOptionValue(option) === value) || null,
    [options, value, getOptionValue]
  );

  useEffect(() => {
    if (!open) {
      setQuery(selectedOption ? getOptionLabel(selectedOption) : '');
    }
  }, [selectedOption, getOptionLabel, open]);

  const filteredOptions = useMemo(() => {
    const term = deferredQuery.trim().toLowerCase();
    const source = Array.isArray(options) ? options : [];
    if (!term) {
      return source.slice(0, maxResults);
    }

    return source
      .filter((option) => {
        const primary = (getOptionLabel(option) || '').toLowerCase();
        const secondary = (getOptionSubLabel?.(option) || '').toLowerCase();
        const searchable = (getOptionSearchText?.(option) || `${primary} ${secondary}`).toLowerCase();
        return searchable.includes(term);
      })
      .slice(0, maxResults);
  }, [options, deferredQuery, getOptionLabel, getOptionSubLabel, getOptionSearchText, maxResults]);

  useEffect(() => () => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
    }
  }, []);

  const handleInputChange = useCallback((nextQuery) => {
    setQuery(nextQuery);
    if (value) {
      onChange?.('', null);
    }
    setOpen(true);
  }, [onChange, value]);

  const selectOption = useCallback((option) => {
    const nextValue = getOptionValue(option);
    setQuery(getOptionLabel(option));
    setOpen(false);
    onChange?.(nextValue, option);
  }, [getOptionLabel, getOptionValue, onChange]);

  const handleBlur = useCallback(() => {
    blurTimeoutRef.current = setTimeout(() => {
      setOpen(false);
      blurTimeoutRef.current = null;
    }, 150);
  }, []);

  const handleFocus = useCallback(() => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setOpen(true);
  }, []);

  return (
    <div className="relative">
      {required && (
        <input
          required
          value={value || ''}
          onChange={() => {}}
          tabIndex={-1}
          className="sr-only"
          aria-hidden="true"
        />
      )}
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onFocus={handleFocus}
        onChange={(event) => handleInputChange(event.target.value)}
        onBlur={handleBlur}
        className={inputClassName}
      />

      {open && !disabled && (
        <div className={menuClassName}>
          {filteredOptions.length > 0 ? (
            filteredOptions.map((option) => (
              <button
                key={getOptionValue(option)}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectOption(option);
                }}
                className="w-full px-3 py-2 text-left text-sm transition hover:bg-blue-50/60"
              >
                <div className="font-medium text-slate-800">{getOptionLabel(option)}</div>
                {getOptionSubLabel && getOptionSubLabel(option) && (
                  <div className="text-xs text-slate-500">{getOptionSubLabel(option)}</div>
                )}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-xs text-slate-500">{noResultsText}</div>
          )}
        </div>
      )}
    </div>
  );
};

export default memo(SearchableSelect);
