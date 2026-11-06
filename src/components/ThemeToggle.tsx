"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        className="w-7 h-7 text-muted-foreground"
      >
        <Sun className="w-3.5 h-3.5" />
      </Button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      className="w-7 h-7 text-muted-foreground hover:text-foreground transition-colors"
    >
      {isDark ? (
        <Sun className="w-3.5 h-3.5 text-amber-400 hover:text-amber-300 transition-transform duration-200" />
      ) : (
        <Moon className="w-3.5 h-3.5 text-indigo-600 hover:text-indigo-500 transition-transform duration-200" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
