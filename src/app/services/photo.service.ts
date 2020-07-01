import { Injectable } from '@angular/core';
import { Platform } from '@ionic/angular';
import { Plugins, CameraResultType, Capacitor, FilesystemDirectory, CameraPhoto, CameraSource } from '@capacitor/core';
import { JSDocCommentStmt } from '@angular/compiler';

const { Camera, Filesystem, Storage } = Plugins;

@Injectable({
  providedIn: 'root'
})
export class PhotoService {
  public photos: Photo[] = [];
  private PHOTO_STORAGE: string = "photos";
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  public async addNewToGallery() {
    // take a photo
    const capturedPhoto = await Camera.getPhoto({
      resultType: CameraResultType.Uri,
      source: CameraSource.Camera,
      quality: 100
    });

    // save the picture and add it to photo collection
    const savedImageFile = await this.savePicture(capturedPhoto);

    //Add new photo to Photos array
    this.photos.unshift(savedImageFile);

    Storage.set({
      key: this.PHOTO_STORAGE,
      value: this.platform.is("hybrid")
      ? JSON.stringify(this.photos)
      : JSON.stringify(this.photos.map(p => {
        // Don't save the base64 representation of the photo data,
        // since it's already saved on the Filesystem
        const photoCopy = { ...p };
        delete photoCopy.base64;
        return photoCopy;
      }))
    });
  }



  public async loadSaved() {
    // Retrieve cached photo array data
    const photos = await Storage.get({ key: this.PHOTO_STORAGE });
    this.photos = JSON.parse(photos.value) || [];

    // Easiest way to detect when running on the web:
    // "when platform in NOT hybrid, do this"
    if (!this.platform.is('hybrid')) {
      // Display the photo by reading into base64 format
      for (let photo of this.photos) {
        // Read each saved photo's data from the Filesystem
        const readFile = await Filesystem.readFile({
          path: photo.filepath,
          directory: FilesystemDirectory.Data
        });
        // Web platform only: Save the phto into the base64 field
        photo.base64 = `data:image/jpeg;base64,${readFile.data}`;
      }
    }
   }

  // Save picture to file on device
  private async savePicture(cameraPhoto: CameraPhoto){
    // convert photo to base64 format, required by Filesystem API to save
    const base64Data = await this.readAsBase64(cameraPhoto);

     // write the file to the data directory
    const fileName = new Date().getTime() + '.jpeg';
    const savedFile = await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: FilesystemDirectory.Data
    });

    if (this.platform.is('hybrid')) {
      // Display the new image by rewritting th 'file://' path to HTTP
      // Details: https://ionicframwork.com/docs/building/webview#file-protocol
      return {
        filepath: savedFile.uri,
        webviewPath: Capacitor.convertFileSrc(savedFile.uri)
      };
    }
    else {
      // Use webPath to display the new image instead of base64 since it's already loaded into memory
      return {
        filepath: fileName,
        webviewPath: cameraPhoto.webPath
      };
    }

  }

  // Read camera photo into base64 format based on the platform the app is running on
  private async readAsBase64(cameraPhoto: CameraPhoto) {
    // "hybrid" wil detect Cordova or Capacitor
    if (this.platform.is('hybrid')) {
      // Read the file into bae64 format
      const file = await Filesystem.readFile({
        path: cameraPhoto.path
      });

      return file.data;
    }
    else {
      // Fetch the photo, read as a blob, then convert to base64 format
      const response = await fetch(cameraPhoto.webPath);
      const blob = await response.blob();

      return await this.convertBlobToBase64(blob) as string;
    }
  }

  public async deletePicture(photo: Photo, position: number) {
    // Remove this photo from the Photos reference data array
    this.photos.splice(position, 1);

    // Update photos array cache by overwriting the existing photos array
    Storage.set({
      key: this.PHOTO_STORAGE,
      value: JSON.stringify(this.photos)
    });

    // delete photo file from Filesystem
    const filename = photo.filepath.substr(photo.filepath.lastIndexOf('/') + 1);

    await Filesystem.deleteFile({
      path: filename,
      directory: FilesystemDirectory.Data
    });
  }

  convertBlobToBase64 = (blob: Blob) => new Promise((resolve, reject) => {
    const reader = new FileReader;
    reader.onerror = reject;
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.readAsDataURL(blob);
  })
}

interface Photo{
  filepath: string;
  webviewPath: string;
  base64?: string;
}
