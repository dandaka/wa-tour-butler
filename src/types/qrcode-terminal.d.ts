declare module 'qrcode-terminal' {
  interface QRCodeTerminalOptions {
    small?: boolean;
  }
  
  function generate(text: string, options?: QRCodeTerminalOptions): void;
  
  export = {
    generate
  };
}
