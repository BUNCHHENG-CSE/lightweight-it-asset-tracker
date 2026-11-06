"use client";

import React, { useRef } from "react";
import { Printer, X, Download, Tag, Check, Sparkles, Layers } from "lucide-react";
import { AssetEnriched } from "@/lib/types";
import { generateBarcodeSvg, generateQrCodeSvg } from "@/lib/qr-generator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AssetLabelPrintModalProps {
  assets: AssetEnriched[];
  onClose: () => void;
}

export default function AssetLabelPrintModal({
  assets,
  onClose,
}: AssetLabelPrintModalProps) {
  const printAreaRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadSvg = (asset: AssetEnriched) => {
    const qrSvg = generateQrCodeSvg(asset.assetTag, { size: 100 });
    const barcodeSvg = generateBarcodeSvg(asset.assetTag, { height: 36 });

    const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="200" viewBox="0 0 380 200" style="background:#fff;font-family:monospace">
      <rect width="380" height="200" rx="10" fill="#ffffff" stroke="#000000" stroke-width="2"/>
      <text x="20" y="28" font-size="11" font-weight="bold" fill="#000000" letter-spacing="1">VANGUARD LABS • IT PROPERTY</text>
      <text x="20" y="60" font-size="22" font-weight="900" fill="#000000">${asset.assetTag}</text>
      <text x="20" y="80" font-size="11" fill="#333333">${asset.modelName.slice(0, 32)}</text>
      <text x="20" y="98" font-size="10" fill="#555555">S/N: ${asset.serialNumber || "N/A"}</text>
      <text x="20" y="116" font-size="10" fill="#555555">DEPT: ${asset.department || "IT STOCK"}</text>
      <g transform="translate(250, 15)">
        ${qrSvg}
      </g>
      <g transform="translate(20, 132)">
        ${barcodeSvg}
      </g>
    </svg>`;

    const blob = new Blob([fullSvg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Asset-Tag-${asset.assetTag}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-card w-full max-w-4xl max-h-[90vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden">
        {/* Header (Hidden on Print) */}
        <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/50 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">
              <Tag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
                <span>Printable Hardware Asset Tags</span>
                <Badge variant="outline" className="font-mono text-[10px] py-0 h-4.5">
                  {assets.length} {assets.length === 1 ? "Label" : "Labels"}
                </Badge>
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Thermal label ready (2&quot; &times; 1&quot; or standard sheet). Scannable with any 2D QR / 1D laser barcode reader.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={handlePrint}
              size="sm"
              className="gap-1.5 font-mono bg-primary text-primary-foreground shadow-xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print {assets.length === 1 ? "Label" : "Sheet"}</span>
            </Button>
            <Button
              onClick={onClose}
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content Body */}
        <div
          ref={printAreaRef}
          className="p-6 overflow-y-auto flex-1 space-y-6 bg-muted/20"
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {assets.map((ast) => {
              const qrHtml = generateQrCodeSvg(ast.assetTag, {
                size: 95,
                color: "#0f172a",
                bgColor: "#ffffff",
              });
              const barcodeHtml = generateBarcodeSvg(ast.assetTag, {
                height: 32,
                barWidth: 1.5,
                showText: false,
                color: "#0f172a",
              });

              return (
                <div
                  key={ast.id}
                  className="bg-white text-slate-900 border-2 border-slate-900 rounded-lg p-4 shadow-sm flex flex-col justify-between font-mono relative group"
                >
                  {/* Download button for single label (Hidden on Print) */}
                  <div className="absolute top-2 right-2 print:hidden opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      onClick={() => handleDownloadSvg(ast)}
                      variant="ghost"
                      size="xs"
                      className="h-6 text-[10px] bg-slate-100 text-slate-700 hover:bg-slate-200 gap-1"
                      title="Download Vector SVG"
                    >
                      <Download className="w-3 h-3" />
                      <span>SVG</span>
                    </Button>
                  </div>

                  <div>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 mb-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">
                        Vanguard Labs • IT Property
                      </span>
                      <span className="text-[9px] font-bold text-slate-500 uppercase">
                        {ast.category}
                      </span>
                    </div>

                    {/* Middle Section: Tag, Model, QR */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1 flex-1 min-w-0">
                        <div className="text-xl font-black text-slate-950 tracking-tight">
                          {ast.assetTag}
                        </div>
                        <div className="text-xs font-bold text-slate-800 truncate">
                          {ast.modelName}
                        </div>
                        <div className="text-[10px] text-slate-600 space-y-0.5">
                          <div>
                            <span className="font-semibold text-slate-700">S/N: </span>
                            <span>{ast.serialNumber || "N/A"}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">Custodian: </span>
                            <span>{ast.assignedTo || "IT Closet Stock"}</span>
                          </div>
                          <div>
                            <span className="font-semibold text-slate-700">Dept: </span>
                            <span>{ast.department || "Operations"}</span>
                          </div>
                        </div>
                      </div>

                      {/* Scannable 2D QR Code */}
                      <div
                        className="shrink-0 p-1 border border-slate-300 rounded bg-white flex items-center justify-center"
                        dangerouslySetInnerHTML={{ __html: qrHtml }}
                      />
                    </div>
                  </div>

                  {/* Bottom: 1D Barcode */}
                  <div className="mt-3 pt-2 border-t border-slate-300">
                    <div
                      className="flex justify-center"
                      dangerouslySetInnerHTML={{ __html: barcodeHtml }}
                    />
                    <div className="text-center text-[9px] text-slate-500 mt-0.5 tracking-widest font-semibold">
                      *{ast.assetTag}*
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer (Hidden on Print) */}
        <div className="p-3 border-t border-border bg-card flex items-center justify-between text-xs text-muted-foreground print:hidden">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>High-contrast ISO/IEC QR Matrix & Code 39 Barcode</span>
          </div>
          <Button onClick={onClose} variant="outline" size="sm" className="font-mono">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
