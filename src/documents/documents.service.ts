import { Injectable, BadRequestException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { extname } from 'path';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DocumentFiles {
  selfieImage: Express.Multer.File;
  docImageTop: Express.Multer.File;
  docImageBottom?: Express.Multer.File;
}

export interface DocumentUrls {
  selfieImage: string;
  docImageTop: string;
  docImageBottom?: string;
}

@Injectable()
export class DocumentsService {
  private readonly uploadDir = './uploads';
  private readonly maxFileSize = 5 * 1024 * 1024; // 5MB
  private readonly allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png'];

  /**
   * Upload profile image
   */
  async uploadProfileImage(
    file: Express.Multer.File,
    userId: string,
  ): Promise<string> {
    this.validateImageFile(file);
    const filename = this.generateFilename(userId, 'profile');
    const filepath = path.join(this.uploadDir, filename);
    
    await fs.writeFile(filepath, file.buffer);
    return filepath;
  }

  /**
   * Upload document images (selfie, docTop, docBottom)
   */
  async uploadDocumentImages(
    files: DocumentFiles,
    userId: string,
  ): Promise<DocumentUrls> {
    // Validate all files
    this.validateImageFile(files.selfieImage);
    this.validateImageFile(files.docImageTop);
    if (files.docImageBottom) {
      this.validateImageFile(files.docImageBottom);
    }

    // Generate filenames
    const selfieFilename = this.generateFilename(userId, 'selfie');
    const docTopFilename = this.generateFilename(userId, 'doc-top');
    const docBottomFilename = files.docImageBottom
      ? this.generateFilename(userId, 'doc-bottom')
      : null;

    // Upload files
    await fs.writeFile(
      path.join(this.uploadDir, selfieFilename),
      files.selfieImage.buffer,
    );
    await fs.writeFile(
      path.join(this.uploadDir, docTopFilename),
      files.docImageTop.buffer,
    );
    if (files.docImageBottom && docBottomFilename) {
      await fs.writeFile(
        path.join(this.uploadDir, docBottomFilename),
        files.docImageBottom.buffer,
      );
    }

    return {
      selfieImage: path.join(this.uploadDir, selfieFilename),
      docImageTop: path.join(this.uploadDir, docTopFilename),
      docImageBottom: docBottomFilename
        ? path.join(this.uploadDir, docBottomFilename)
        : undefined,
    };
  }

  /**
   * Validate image file
   */
  private validateImageFile(file: Express.Multer.File): void {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    if (!this.allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Invalid file type. Only JPEG and PNG images are allowed.',
      );
    }

    if (file.size > this.maxFileSize) {
      throw new BadRequestException(
        'File size exceeds 5MB limit',
      );
    }
  }

  /**
   * Generate unique filename
   */
  private generateFilename(userId: string, type: string): string {
    const timestamp = Date.now();
    const uuid = uuidv4();
    return `${userId}-${type}-${timestamp}-${uuid}.jpg`;
  }
}
