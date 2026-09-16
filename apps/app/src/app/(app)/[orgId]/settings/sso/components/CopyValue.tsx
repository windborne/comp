'use client';

import { Button, Text } from '@trycompai/design-system';
import { Checkmark, Copy } from '@trycompai/design-system/icons';
import { useState } from 'react';
import { toast } from 'sonner';

/** A read-only value (URL, DNS record) with a copy button. Wraps on narrow screens. */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(`${label} copied`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
      <div className="min-w-0 flex-1 break-all">
        <Text as="span" size="sm" font="mono">
          {value}
        </Text>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={handleCopy}
        aria-label={`Copy ${label}`}
      >
        {copied ? <Checkmark size={16} /> : <Copy size={16} />}
      </Button>
    </div>
  );
}
